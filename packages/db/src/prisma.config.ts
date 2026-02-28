import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL is validated at runtime in src/index.ts via parseEnvironment.
// prisma generate only reads schema files and does not connect to a database,
// so a placeholder is acceptable here when DATABASE_URL is not set (e.g. CI).
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://localhost/placeholder";

export default defineConfig({
	schema: "./schemas",

	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: databaseUrl,
	},
});
