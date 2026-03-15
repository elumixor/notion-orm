import * as babelGenerator from "@babel/generator";
import * as parser from "@babel/parser";
import * as t from "@babel/types";
import fs from "fs";

const generate = (babelGenerator as { default?: typeof babelGenerator }).default ?? babelGenerator;

export function validateAndGetUndashedUuid(id: string): string | undefined {
  // Support Notion URLs
  const urlMatch = id.match(/[0-9a-f]{32}/i);
  if (urlMatch) return urlMatch[0].toLowerCase();

  const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  const undashed = id.replace(/-/g, "");
  return uuidPattern.test(undashed) ? undashed.toLowerCase() : undefined;
}

export async function writeConfigFileWithAST(configPath: string, newDatabaseId: string): Promise<boolean> {
  const originalContent = fs.readFileSync(configPath, "utf-8");
  const ast = parser.parse(originalContent, { sourceType: "module", plugins: ["typescript"] });
  let modified = false;

  function modifyDatabaseIdsInObject(objExpression: t.ObjectExpression): void {
    for (const prop of objExpression.properties) {
      if (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === "databaseIds" &&
        t.isArrayExpression(prop.value)
      ) {
        const existingIds = prop.value.elements
          .filter((el): el is t.StringLiteral => t.isStringLiteral(el))
          .map((el) => el.value);
        if (!existingIds.includes(newDatabaseId)) {
          prop.value.elements.push(t.stringLiteral(newDatabaseId));
          modified = true;
        }
        break;
      }
    }
  }

  function visitNode(node: t.Node): void {
    if (t.isVariableDeclarator(node) && t.isObjectExpression(node.init)) {
      modifyDatabaseIdsInObject(node.init);
    } else if (t.isExportDefaultDeclaration(node) && t.isObjectExpression(node.declaration)) {
      modifyDatabaseIdsInObject(node.declaration);
    } else if (
      t.isAssignmentExpression(node) &&
      t.isMemberExpression(node.left) &&
      t.isIdentifier(node.left.property) &&
      node.left.property.name === "exports" &&
      t.isObjectExpression(node.right)
    ) {
      modifyDatabaseIdsInObject(node.right);
    }
  }

  function traverse(node: unknown): void {
    if (!node || typeof node !== "object") return;
    visitNode(node as t.Node);
    for (const key of Object.keys(node as object)) {
      const child = (node as Record<string, unknown>)[key];
      if (Array.isArray(child)) child.forEach(traverse);
      else if (child && typeof child === "object") traverse(child);
    }
  }

  traverse(ast);

  if (modified) {
    const output = (generate as (ast: unknown, opts: unknown) => { code: string })(ast, { retainLines: true });
    fs.writeFileSync(configPath, output.code);
    return true;
  }
  return false;
}

export function isHelpCommand(args: string[]): boolean {
  return args[0] === "help" || args[0] === "--help" || args[0] === "-h";
}
