import { describe, expect, it } from "vitest";
import { toPersistableRepository } from "../modules/webhooks/github/repository-helpers.js";

describe("toPersistableRepository", () => {
	it("returns null when required string fields are whitespace only", () => {
		const result = toPersistableRepository({
			id: 123,
			name: "   ",
			full_name: "acme/docs",
			default_branch: "main",
			owner: { login: "acme" },
		});

		expect(result).toBeNull();
	});

	it("trims valid string fields and returns persistable data", () => {
		const result = toPersistableRepository({
			id: 123,
			name: " docs ",
			full_name: " acme/docs ",
			default_branch: " main ",
			owner: { login: " acme " },
		});

		expect(result).toEqual({
			providerRepositoryId: "123",
			ownerLogin: "acme",
			name: "docs",
			fullName: "acme/docs",
			defaultBranch: "main",
		});
	});
});
