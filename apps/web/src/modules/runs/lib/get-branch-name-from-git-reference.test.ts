import { describe, expect, it } from "bun:test";
import { getBranchNameFromGitReference } from "./get-branch-name-from-git-reference";

describe("getBranchNameFromGitReference", () => {
	it("returns the branch name for refs/heads references", () => {
		expect(getBranchNameFromGitReference("refs/heads/main")).toBe("main");
		expect(getBranchNameFromGitReference("refs/heads/feature/new-ui")).toBe("feature/new-ui");
	});

	it("returns the input unchanged when not a refs/heads reference", () => {
		expect(getBranchNameFromGitReference("main")).toBe("main");
		expect(getBranchNameFromGitReference("refs/tags/v1.0.0")).toBe("refs/tags/v1.0.0");
	});

	it("returns an empty string for nullish input", () => {
		expect(getBranchNameFromGitReference("")).toBe("");
		expect(getBranchNameFromGitReference(null)).toBe("");
		expect(getBranchNameFromGitReference(undefined)).toBe("");
	});
});
