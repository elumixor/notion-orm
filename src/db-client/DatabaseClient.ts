import { Client } from "@notionhq/client";
import type {
  CreatePageParameters,
  CreatePageResponse,
  QueryDataSourceParameters,
  UpdatePageParameters,
} from "@notionhq/client/build/src/api-endpoints";
import type { ZodTypeAny } from "zod";
import { AST_RUNTIME_CONSTANTS } from "../ast/constants";
import { buildPropertyValueForAddPage } from "./add";
import { buildQueryResponse, recursivelyBuildFilter } from "./query";
import type {
  Query,
  QueryFilter,
  QueryResult,
  QueryResultType,
  SupportedNotionColumnType,
} from "./queryTypes";

export type camelPropertyNameToNameAndTypeMapType = Record<
  string,
  { columnName: string; type: SupportedNotionColumnType }
>;

export class DatabaseClient<
  DatabaseSchemaType extends Record<string, any>,
  ColumnNameToColumnType extends Record<
    keyof DatabaseSchemaType,
    SupportedNotionColumnType
  >
> {
  private client: Client;
  private id: string;
  private camelPropertyNameToNameAndTypeMap: camelPropertyNameToNameAndTypeMapType;
  private schema: ZodTypeAny;
  public name: string;
  private loggedSchemaValidationIssues: Set<string>;

  constructor(args: {
    id: string;
    camelPropertyNameToNameAndTypeMap: camelPropertyNameToNameAndTypeMapType;
    auth: string;
    name: string;
    schema: ZodTypeAny;
  }) {
    // Automatically use global fetch if available (fixes Cloudflare Workers compatibility)
    // Bind fetch to globalThis to avoid "Illegal invocation" errors when Notion client calls it with .call(this, ...)
    const fetchImpl =
      typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined;

    this.client = new Client({
      auth: args.auth,
      notionVersion: AST_RUNTIME_CONSTANTS.NOTION_API_VERSION,
      fetch: fetchImpl,
    });
    this.id = args.id;
    this.camelPropertyNameToNameAndTypeMap =
      args.camelPropertyNameToNameAndTypeMap;
    this.schema = args.schema;
    this.name = args.name;
    this.loggedSchemaValidationIssues = new Set();
  }

  // Add page to a database
  public async add(args: {
    properties: DatabaseSchemaType;
    icon?: CreatePageParameters["icon"];
  }): Promise<CreatePageParameters | CreatePageResponse> {
    const { properties: pageObject, icon } = args;
    const callBody: CreatePageParameters = {
      parent: {
        data_source_id: this.id,
        type: "data_source_id",
      },
      properties: {},
    };

    callBody.icon = icon;

    Object.entries(pageObject).forEach(([propertyName, value]) => {
      const { type, columnName } =
        this.camelPropertyNameToNameAndTypeMap[propertyName];
      const columnObject = buildPropertyValueForAddPage({
        type,
        value,
      });

      if (callBody.properties && columnObject) {
        callBody.properties[columnName] = columnObject;
      }
    });

    return await this.client.pages.create(callBody);
  }

  // Update an existing page's properties
  public async update(
    id: string,
    properties: Partial<DatabaseSchemaType>,
    icon?: UpdatePageParameters["icon"]
  ): Promise<void> {
    const callBody: UpdatePageParameters = { page_id: id, properties: {} };

    if (icon !== undefined) callBody.icon = icon;

    Object.entries(properties).forEach(([propertyName, value]) => {
      const { type, columnName } = this.camelPropertyNameToNameAndTypeMap[propertyName];
      const columnObject = buildPropertyValueForAddPage({ type, value });
      if (callBody.properties && columnObject) {
        callBody.properties[columnName] = columnObject;
      }
    });

    await this.client.pages.update(callBody);
  }

  // Archive (delete) a page
  public async delete(id: string): Promise<void> {
    await this.client.pages.update({ page_id: id, archived: true });
  }

  // Find a page matching the filter and update it, or create it if not found
  public async upsert(args: {
    where: QueryFilter<DatabaseSchemaType, ColumnNameToColumnType>;
    properties: DatabaseSchemaType;
    icon?: CreatePageParameters["icon"];
  }): Promise<{ created: boolean; id: string }> {
    const queryCall = this.buildQueryCall({ filter: args.where });
    const response = await this.client.dataSources.query({ ...queryCall, page_size: 1 });

    if (response.results.length > 0) {
      const existingId = response.results[0].id;
      await this.update(existingId, args.properties, args.icon);
      return { created: false, id: existingId };
    }

    const created = await this.add({ properties: args.properties, icon: args.icon });
    return { created: true, id: (created as { id: string }).id };
  }

  // Look for page inside the database
  public query<Args extends Query<DatabaseSchemaType, ColumnNameToColumnType> & { pagination: { pageSize: number } }>(
    query: Args
  ): AsyncIterable<QueryResultType<DatabaseSchemaType, Args>>;
  public query<Args extends Omit<Query<DatabaseSchemaType, ColumnNameToColumnType>, "pagination">>(
    query: Args
  ): Promise<QueryResultType<DatabaseSchemaType, Args>[]>;
  public query(query: Query<DatabaseSchemaType, ColumnNameToColumnType>): unknown {
    const queryCall = this.buildQueryCall(query);
    if (query.pagination) return this.paginatedIterable(queryCall, query);
    return this.fetchAllPages(queryCall, query);
  }

  private buildQueryCall(query: Query<DatabaseSchemaType, ColumnNameToColumnType>): QueryDataSourceParameters {
    const queryCall: QueryDataSourceParameters = { data_source_id: this.id };
    if (query.sort?.length) {
      queryCall["sorts"] = query.sort.map((s) => {
        if (!("property" in s)) return s;
        return { ...s, property: this.camelPropertyNameToNameAndTypeMap[s.property]?.columnName ?? s.property };
      });
    }
    if (query.filter) {
      // @ts-expect-error errors vs notion api types
      queryCall["filter"] = recursivelyBuildFilter(query.filter, this.camelPropertyNameToNameAndTypeMap);
    }
    return queryCall;
  }

  private async fetchAllPages(
    queryCall: QueryDataSourceParameters,
    query: Query<DatabaseSchemaType, ColumnNameToColumnType>
  ): Promise<QueryResult<DatabaseSchemaType>[]> {
    const allResults: QueryResult<DatabaseSchemaType>[] = [];
    let cursor: string | undefined;
    let isFirst = true;

    do {
      const response = await this.client.dataSources.query({ ...queryCall, start_cursor: cursor, page_size: 100 });
      const page = buildQueryResponse<DatabaseSchemaType>(
        response,
        this.camelPropertyNameToNameAndTypeMap,
        isFirst ? (r) => this.validateDatabaseSchema(r) : () => {}
      );
      isFirst = false;

      allResults.push(...this.applySelectOmit(page, query.select, query.omit));
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor && (!query.limit || allResults.length < query.limit));

    return query.limit ? allResults.slice(0, query.limit) : allResults;
  }

  private paginatedIterable(
    queryCall: QueryDataSourceParameters,
    query: Query<DatabaseSchemaType, ColumnNameToColumnType>
  ): AsyncIterable<QueryResult<DatabaseSchemaType>> {
    const self = this;
    const pageSize = query.pagination!.pageSize;

    return {
      [Symbol.asyncIterator]: async function* () {
        let cursor: string | undefined;
        let isFirst = true;
        let yielded = 0;

        do {
          const response = await self.client.dataSources.query({ ...queryCall, start_cursor: cursor, page_size: pageSize });

          const page = buildQueryResponse<DatabaseSchemaType>(
            response,
            self.camelPropertyNameToNameAndTypeMap,
            isFirst ? (r) => self.validateDatabaseSchema(r) : () => {}
          );
          isFirst = false;

          for (const item of self.applySelectOmit(page, query.select, query.omit)) {
            yield item;
            if (query.limit && ++yielded >= query.limit) return;
          }

          cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
        } while (cursor);
      },
    };
  }

  private applySelectOmit(
    results: QueryResult<DatabaseSchemaType>[],
    select?: Partial<Record<keyof DatabaseSchemaType, true>>,
    omit?: Partial<Record<keyof DatabaseSchemaType, true>>
  ): QueryResult<DatabaseSchemaType>[] {
    if (!select && !omit) return results;
    return results.map((result) => {
      const out: Record<string, unknown> = { id: result.id };
      if (select) {
        for (const key of Object.keys(select)) if (key in result) out[key] = (result as Record<string, unknown>)[key];
      } else if (omit) {
        for (const key of Object.keys(result) as string[])
          if (key !== "id" && !(omit as Record<string, unknown>)[key]) out[key] = (result as Record<string, unknown>)[key];
      }
      return out as QueryResult<DatabaseSchemaType>;
    });
  }

  private validateDatabaseSchema(result: Partial<DatabaseSchemaType>) {
    if (!this.schema) {
      return;
    }

    const schemaLabel = this.name ?? this.id;
    const remoteColumnNames = new Set(Object.keys(result));

    // Check for missing expected properties (schema drift detection)
    const missingProperties: string[] = [];
    for (const propName in this.camelPropertyNameToNameAndTypeMap) {
      if (!remoteColumnNames.has(propName)) {
        missingProperties.push(propName);
      }
    }

    if (missingProperties.length > 0) {
      const issueSignature = JSON.stringify({
        type: "missing_properties",
        properties: missingProperties,
      });

      if (!this.loggedSchemaValidationIssues.has(issueSignature)) {
        this.loggedSchemaValidationIssues.add(issueSignature);
        // biome-ignore lint/suspicious/noConsole: surface schema drift to the
        // developer console
        console.error(
          `⚠️ ${AST_RUNTIME_CONSTANTS.PACKAGE_LOG_PREFIX} ${AST_RUNTIME_CONSTANTS.SCHEMA_DRIFT_PREFIX} for the following Notion database ${schemaLabel}
					\nMissing properties: ${missingProperties
            .map((prop) => `\`${prop}\``)
            .join(", ")}
					\n\n✅ ${AST_RUNTIME_CONSTANTS.SCHEMA_DRIFT_HELP_MESSAGE}
					`
        );
      }
    }

    // Check for unexpected properties
    for (const remoteColName of remoteColumnNames) {
      if (remoteColName === "id") continue;
      if (!this.camelPropertyNameToNameAndTypeMap[remoteColName]) {
        const issueSignature = JSON.stringify({
          type: "unexpected_property",
          property: remoteColName,
        });

        if (!this.loggedSchemaValidationIssues.has(issueSignature)) {
          this.loggedSchemaValidationIssues.add(issueSignature);
          // biome-ignore lint/suspicious/noConsole: surfaced for debugging
          // unexpected Notion payloads
          console.error(
            `⚠️ ${AST_RUNTIME_CONSTANTS.PACKAGE_LOG_PREFIX} ${AST_RUNTIME_CONSTANTS.SCHEMA_DRIFT_PREFIX} for the following Notion database ${schemaLabel}
						\nUnexpected property found in remote data: \`${remoteColName}\`
						\n\n✅ ${AST_RUNTIME_CONSTANTS.SCHEMA_DRIFT_HELP_MESSAGE}
						`
          );
        }
      }
    }

    // Validate against Zod schema
    const parseResult = this.schema.safeParse(result);
    if (parseResult.success) {
      return;
    }

    const issueSignature = JSON.stringify(
      parseResult.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      }))
    );

    if (this.loggedSchemaValidationIssues.has(issueSignature)) {
      return;
    }
    this.loggedSchemaValidationIssues.add(issueSignature);
    // biome-ignore lint/suspicious/noConsole: surface schema drift to the
    // developer console
    console.error(
      `⚠️ ${AST_RUNTIME_CONSTANTS.PACKAGE_LOG_PREFIX} ${AST_RUNTIME_CONSTANTS.SCHEMA_DRIFT_PREFIX} for the following Notion database ${schemaLabel}
			\nValidation issues: ${parseResult.error.issues
        .map((issue) => `\`${issue.path.join(".")}: ${issue.message}\``)
        .join(", ")}
			\n\n✅ ${AST_RUNTIME_CONSTANTS.SCHEMA_DRIFT_HELP_MESSAGE}
			`
    );
    // biome-ignore lint/suspicious/noConsole: surface schema drift to the
    // developer console
    console.log("Validation details:", {
      issues: parseResult.error.issues,
      result: result,
    });
  }
}
