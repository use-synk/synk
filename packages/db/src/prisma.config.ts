import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "./schemas",

	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: process.env.DATABASE_URL ?? "",
	},
});
