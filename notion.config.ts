const config = {
  auth: process.env.NOTION_API_KEY ?? "",
  databaseIds: [process.env.NOTION_TASKS_DB_ID ?? ""],
};

export default config;
