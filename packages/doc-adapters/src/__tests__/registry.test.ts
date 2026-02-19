import { describe, expect, it } from "vitest";

import { FRAMEWORK_IDS, detectAdapter, getAdapter } from "../registry.js";

describe("getAdapter", () => {
	it("returns markdown adapter for 'markdown'", () => {
		const adapter = getAdapter("markdown");
		expect(adapter.frameworkId).toBe("markdown");
	});

	it("throws for unknown framework", () => {
		expect(() => getAdapter("unknown")).toThrow("Unknown doc framework: unknown");
	});

	it("resolves all declared FRAMEWORK_IDS", () => {
		for (const id of FRAMEWORK_IDS) {
			const adapter = getAdapter(id);
			expect(adapter.frameworkId).toBe(id);
		}
	});

	it("marks pending adapters with explicit fallback conventions", () => {
		const adapter = getAdapter("nextra");
		const conventions = adapter.getConventions();
		expect(conventions.description).toContain("not implemented yet");
		expect(conventions.description).toContain("markdown fallback");
	});
});

describe("detectAdapter", () => {
	it("returns markdown adapter for repo with docs/ directory", async () => {
		const tree = [{ path: "docs/readme.md" }];
		const adapter = await detectAdapter(tree);
		expect(adapter.frameworkId).toBe("markdown");
	});

	it("returns markdown adapter for repo with README.md", async () => {
		const tree = [{ path: "README.md" }];
		const adapter = await detectAdapter(tree);
		expect(adapter.frameworkId).toBe("markdown");
	});

	it("returns markdown adapter for repo with .md files", async () => {
		const tree = [{ path: "guide.md" }];
		const adapter = await detectAdapter(tree);
		expect(adapter.frameworkId).toBe("markdown");
	});

	it("returns markdown adapter for empty tree (fallback)", async () => {
		const adapter = await detectAdapter([]);
		expect(adapter.frameworkId).toBe("markdown");
	});
});
