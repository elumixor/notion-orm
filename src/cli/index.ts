#!/usr/bin/env bun

import { loadConfig, clearConfigCache } from "../config/loadConfig";
import { createDatabaseTypes } from "../ast/generate-databases-cli";
import { validateAndGetUndashedUuid, writeConfigFileWithAST, isHelpCommand } from "./helpers";
import { findConfigFile, initializeNotionConfigFile, validateConfig } from "config/helpers";

async function runGenerate(): Promise<void> {
  try {
    await validateConfig();
    const { databaseNames } = await createDatabaseTypes({ type: "all" });
    if (databaseNames.length === 0) {
      console.log("⚠️  Generated no types");
    } else {
      console.log("✅ Generated types for:");
      databaseNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`));
    }
  } catch (error) {
    console.error("❌ Error generating types:", error);
    process.exit(1);
  }
}

async function runAdd(name: string, input: string): Promise<void> {
  const undashedUuid = validateAndGetUndashedUuid(input);
  if (!undashedUuid) {
    console.error("❌ Invalid database ID or URL format");
    process.exit(1);
  }

  const configFile = findConfigFile();
  if (!configFile) {
    console.error("❌ No notion.config.ts found. Run `notion init` first.");
    process.exit(1);
  }

  const config = await loadConfig(configFile.path);
  const existing = config.databases ?? {};

  if (Object.values(existing).includes(undashedUuid)) {
    console.log(`⚠️  Database ID already in config — regenerating types...`);
  } else {
    const wasModified = writeConfigFileWithAST(configFile.path, name, undashedUuid);
    if (wasModified) console.log("🔗 Added database to config");
  }

  clearConfigCache();
  const { databaseNames } = await createDatabaseTypes({ type: "incremental", name, id: undashedUuid });
  if (databaseNames.length > 0) console.log(`✅ Generated schema for '${databaseNames[0]}'`);
  console.log("\n📄 Run `notion generate` to refresh all schemas.");
}

function showHelp(): void {
  console.log(`Notion ORM CLI
Usage:
  notion init                       - Create notion.config.ts
  notion generate                   - Generate types from configured databases
  notion add <name> <database-id-or-url>   - Add database and generate types`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "init") return await initializeNotionConfigFile();
  if (args[0] === "generate") return await runGenerate();
  if (args[0] === "add" && args[1] && args[2]) return await runAdd(args[1], args[2]);
  if (isHelpCommand(args)) return showHelp();

  showHelp();
}

main().catch((error: unknown) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
