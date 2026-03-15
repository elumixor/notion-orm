import { pathToFileURL } from "url";
import type { NotionConfigType } from "./helpers";
import { findConfigFile } from "./helpers";

let cachedConfig: NotionConfigType | undefined = undefined;

export async function loadUserConfig(absolutePath: string): Promise<unknown> {
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  try {
    const importPath = isBun ? absolutePath : pathToFileURL(absolutePath).href;
    const mod = await import(importPath);
    return mod.default ?? mod;
  } catch (e) {
    throw new Error(`Failed to load config from '${absolutePath}': \n       ${e}`);
  }
}

export async function loadConfig(configPath: string): Promise<NotionConfigType> {
  try {
    const config = await loadUserConfig(configPath);
    return config as NotionConfigType;
  } catch (error) {
    throw new Error(`Failed to load config from ${configPath}: ${(error as Error).message}`);
  }
}

export async function getNotionConfig(): Promise<NotionConfigType> {
  if (cachedConfig) return cachedConfig;

  const configFile = await findConfigFile();

  if (!configFile) {
    const auth = process.env.NOTION_API_KEY ?? process.env.NOTION_AUTH ?? process.env.NOTION_KEY;
    if (auth) {
      cachedConfig = { auth, databaseIds: [] };
      return cachedConfig;
    }
    throw new Error(
      "No notion.config.ts found and no NOTION_API_KEY environment variable set. " +
        "Create a config file or set NOTION_API_KEY.",
    );
  }

  const config = await loadConfig(configFile.path);
  if (!config.auth) throw new Error("Missing 'auth' field in notion config");

  cachedConfig = config;
  return config;
}

export function clearConfigCache(): void {
  cachedConfig = undefined;
}
