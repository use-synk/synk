import { afterEach, describe, expect, it } from "bun:test";

const MODULE_PATH = "./prisma.config";
const originalDatabaseUrl = process.env.DATABASE_URL;

const importConfig = async () => {
	return import(`${MODULE_PATH}?cacheBust=${Date.now()}-${Math.random()}`);
};

afterEach(() => {
	if (typeof originalDatabaseUrl === "string") {
		process.env.DATABASE_URL = originalDatabaseUrl;
		return;
	}

	delete process.env.DATABASE_URL;
});

describe("prisma config", () => {
	it("uses DATABASE_URL when provided", async () => {
		process.env.DATABASE_URL = "postgresql://localhost:5432/synk_test";

		const module = await importConfig();
		expect(module.default.datasource.url).toBe("postgresql://localhost:5432/synk_test");
	});

	it("falls back to placeholder url when DATABASE_URL is missing", async () => {
		delete process.env.DATABASE_URL;

		const module = await importConfig();
		expect(module.default.datasource.url).toBe("postgresql://localhost/placeholder");
	});
});
