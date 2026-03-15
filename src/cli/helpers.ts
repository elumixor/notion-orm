import fs from "fs";

export function validateAndGetUndashedUuid(id: string): string | undefined {
  // Support Notion URLs
  const urlMatch = id.match(/[0-9a-f]{32}/i);
  if (urlMatch) return urlMatch[0].toLowerCase();

  const uuidPattern = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  const undashed = id.replace(/-/g, "");
  return uuidPattern.test(undashed) ? undashed.toLowerCase() : undefined;
}

export function writeConfigFileWithAST(configPath: string, name: string, databaseId: string): boolean {
  const content = fs.readFileSync(configPath, "utf-8");

  if (content.includes(databaseId)) return false;

  const entry = `${name}: "${databaseId}"`;
  const modified = content.replace(/(\bdatabases\s*:\s*\{)([\s\S]*?)(\})/, (_, open, inner, close) => {
    const hasItems = inner.trim().length > 0;
    if (!hasItems) return `${open} ${entry} ${close}`;

    if (inner.includes("\n")) {
      const trimmed = inner.trimEnd();
      const comma = trimmed.endsWith(",") ? "" : ",";
      const indent = inner.match(/\n(\s+)/)?.[1] ?? "  ";
      const closingIndent = inner.match(/\n(\s*)$/)?.[1] ?? "";
      return `${open}${trimmed}${comma}\n${indent}${entry},\n${closingIndent}${close}`;
    }

    const trimmed = inner.trimEnd();
    const comma = trimmed.endsWith(",") ? " " : ", ";
    return `${open}${trimmed}${comma}${entry}${close}`;
  });

  if (modified === content) return false;

  fs.writeFileSync(configPath, modified);
  return true;
}

export function isHelpCommand(args: string[]): boolean {
  return args[0] === "help" || args[0] === "--help" || args[0] === "-h";
}
