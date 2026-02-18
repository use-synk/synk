import { env } from "@/env";
import { db as dbClient } from "@synk-ai/db";

const createPrismaClient = () => {
	return dbClient;
};

const globalForPrisma = globalThis as unknown as {
	prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
