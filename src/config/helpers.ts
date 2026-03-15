import path from "path";
import fs from "fs";
import { getNotionConfig } from "./loadConfig";

export type NotionConfigType = {
  auth: string;
  databases: Record<string, string>;
};

export async function validateConfig(): Promise<void> {
  const config = await getNotionConfig();

  if (!config.auth) {
    console.error("❌ Missing 'auth' in config. Add your Notion integration token.");
    process.exit(1);
  }
  if (!config.databases || Object.keys(config.databases).length === 0) {
    console.error("❌ 'databases' must be a non-empty object in config.");
    process.exit(1);
  }
}

export function findConfigFile(): { path: string; isTS: true } | undefined {
  const configPath = path.join(process.cwd(), "notion.config.ts");
  if (fs.existsSync(configPath)) return { path: configPath, isTS: true };
  return undefined;
}

export async function initializeNotionConfigFile(): Promise<void> {
  const existing = findConfigFile();
  if (existing) {
    console.log("⚠️  notion.config.ts already exists — skipping init.");
    return;
  }

  const configPath = path.join(process.cwd(), "notion.config.ts");
  const template = `import type { NotionConfigType } from "@elumixor/notion-orm";

export default {
  auth: process.env.NOTION_API_KEY ?? "",
  databases: {
    // Add databases here, e.g.:
    // tasks: "2ec26381fbfd80f78a11ceed660e9a07"
  },
} satisfies NotionConfigType;
`;
  fs.writeFileSync(configPath, template);
  console.log("✅ Created notion.config.ts");
}
