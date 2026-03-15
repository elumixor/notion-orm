/**
 * Internal constants for AST and db-client modules.
 */

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Package root: src/ast/ → src/ → package root
const PACKAGE_ROOT = path.resolve(__dirname, "../../");

// When running in development (cwd is the package itself), use relative import paths.
// When installed externally, use the package name so generated files resolve correctly.
const IS_DEV = process.cwd() === PACKAGE_ROOT;

/** Generated DB files directory — always relative to the consuming project */
export const DATABASES_DIR = path.join(process.cwd(), "generated");

/** File system paths for CLI output */
export const AST_FS_PATHS = {
  /** metadata.json inside generated/ */
  get metadataFile() {
    return path.join(DATABASES_DIR, AST_FS_FILENAMES.METADATA);
  },

  /** src/index.ts — the dynamic barrel rewritten on every generate */
  get sourceIndexTs() {
    return path.join(process.cwd(), "src", "index.ts");
  },

  /** generated/index.ts — barrel exporting all DB clients */
  get generatedBarrelTs() {
    return path.join(DATABASES_DIR, AST_FS_FILENAMES.INDEX_TS);
  },
} as const;

export const AST_FS_FILENAMES = {
  METADATA: "metadata.json",
  INDEX_TS: "index.ts",
} as const;

/** Import path strings used when generating TypeScript code */
export const AST_IMPORT_PATHS = {
  DATABASE_CLIENT: IS_DEV ? "../src/db-client/DatabaseClient" : "@elumixor/notion-orm",
  QUERY_TYPES: IS_DEV ? "../src/db-client/queryTypes" : "@elumixor/notion-orm",
  ZOD: "zod",

  databaseClass(className: string): string {
    return `../generated/${className}`;
  },
} as const;

export const AST_RUNTIME_CONSTANTS = {
  NOTION_API_VERSION: "2025-09-03",
  PACKAGE_LOG_PREFIX: "[@elumixor/notion-orm]",
  CLI_GENERATE_COMMAND: "notion generate",
  SCHEMA_DRIFT_PREFIX: "Schema drift detected",
  SCHEMA_DRIFT_HELP_MESSAGE: "Run `notion generate` to refresh all database schemas.",
} as const;

export const AST_TYPE_NAMES = {
  DATABASE_SCHEMA_TYPE: "DatabaseSchemaType",
  COLUMN_NAME_TO_COLUMN_TYPE: "ColumnNameToColumnType",
  QUERY_SCHEMA_TYPE: "QuerySchemaType",
  PROPERTY_VALUES_SUFFIX: "PropertyValues",
} as const;
