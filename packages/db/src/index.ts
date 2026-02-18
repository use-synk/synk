import { PrismaPg } from "@prisma/adapter-pg";
import { databaseEnvironmentSchema, parseEnvironment } from "@synk-ai/shared";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client";

const createPrismaClient = () => {
	const environment = parseEnvironment(databaseEnvironmentSchema);

	const pool = new Pool({
		connectionString: environment.DATABASE_URL,
		max: 1,
		idleTimeoutMillis: 30000,
		connectionTimeoutMillis: 10000,
	});

	pool.on("error", (err) => {
		// biome-ignore lint/suspicious/noConsole: Need to log errors while no logger is available
		console.error("Unexpected error on idle database client:", err);
	});

	const adapter = new PrismaPg(pool);

	return new PrismaClient({
		adapter,
		log: environment.NODE_ENV === "development" ? ["error", "query", "warn"] : [],
	});
};

export const db = createPrismaClient();
