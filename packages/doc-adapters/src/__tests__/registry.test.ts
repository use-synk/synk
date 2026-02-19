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

	it("supports all FRAMEWORK_IDS except unimplemented ones", () => {
		expect(getAdapter("markdown").frameworkId).toBe("markdown");
		for (const id of FRAMEWORK_IDS) {
			if (id === "markdown") continue;
			expect(() => getAdapter(id)).toThrow();
		}
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
