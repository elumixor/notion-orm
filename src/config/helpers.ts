import path from "path";
import fs from "fs";
import { getNotionConfig } from "./loadConfig";

export type NotionConfigType = {
  auth: string;
  databaseIds: string[];
};

export async function validateConfig(): Promise<void> {
  const config = await getNotionConfig();

  if (!config.auth) {
    console.error("❌ Missing 'auth' in config. Add your Notion integration token.");
    process.exit(1);
  }
  if (!Array.isArray(config.databaseIds) || config.databaseIds.length === 0) {
    console.error("❌ 'databaseIds' must be a non-empty array in config.");
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
  const template = `// Notion ORM config
// Set NOTION_API_KEY in your .env file

const config = {
  auth: process.env.NOTION_API_KEY ?? "",
  databaseIds: [
    // Add database IDs here, e.g.:
    // "2ec26381fbfd80f78a11ceed660e9a07"
  ],
};

export default config;
`;
  fs.writeFileSync(configPath, template);
  console.log("✅ Created notion.config.ts");
}
