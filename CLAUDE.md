Inherits coding style from ~/dev/atma/services/CLAUDE.md

## This Package

TypeScript-only Notion ORM that generates typed database clients from Notion schemas.

- Uses Bun natively — no build step, run TS files directly
- CLI: `bun src/cli/index.ts generate` — generates `generated/<DbName>.ts` and rewrites `src/index.ts`
- Config: `notion.config.ts` in the consuming project (or package root for testing)
- API key: `NOTION_API_KEY` env var (or `auth` field in config)

## Development

- Run `bun install` to install deps
- Run `bun src/cli/index.ts generate` to generate types
- Generated files in `generated/` are gitignored — regenerate as needed
