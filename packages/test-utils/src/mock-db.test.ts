import { describe, expect, it } from "bun:test";
import { createMockDb } from "./mock-db";

describe("createMockDb", () => {
	it("creates model delegates with mocked prisma methods", () => {
		const mockDb = createMockDb();

		expect(typeof mockDb.providerInstallation.findFirst).toBe("function");
		expect(typeof mockDb.providerRepository.update).toBe("function");
		expect(typeof mockDb.user.findUnique).toBe("function");
		expect(typeof mockDb.$transaction).toBe("function");
	});
});
