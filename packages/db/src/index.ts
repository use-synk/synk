import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma/client";

const createPrismaClient = () => {
	const connectionString = process.env.DATABASE_URL ?? "";

	const pool = new Pool({
		connectionString,
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
		log: process.env.NODE_ENV === "development" ? ["error", "query", "warn"] : [],
	});
};

export const db = createPrismaClient();
