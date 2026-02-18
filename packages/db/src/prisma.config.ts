import "dotenv/config";
import { databaseEnvironmentSchema, parseEnvironment } from "@synk-ai/shared";
import { defineConfig } from "prisma/config";

const environment = parseEnvironment(databaseEnvironmentSchema);

export default defineConfig({
	schema: "./schemas",

	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: environment.DATABASE_URL,
	},
});
