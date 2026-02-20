import { describe, expect, it } from "bun:test";

import { FRAMEWORK_IDS, detectAdapter, detectFramework, getAdapter } from "../registry.js";

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
		const adapter = getAdapter("docusaurus");
		const conventions = adapter.getConventions();
		expect(conventions.description).toContain("not implemented yet");
		expect(conventions.description).toContain("markdown fallback");
	});
});

describe("detectAdapter", () => {
	it("prefers higher-priority adapters when multiple frameworks match", async () => {
		const tree = [
			{ path: "next.config.mjs" },
			{ path: "pages/docs/_meta.json" },
			{ path: "content/docs/meta.json" },
			{ path: "source.config.ts" },
		];
		const packageJson = JSON.stringify({
			dependencies: {
				nextra: "^2.0.0",
				"fumadocs-core": "^1.0.0",
			},
		});

		const adapter = await detectAdapter(tree, { packageJson });
		expect(adapter.frameworkId).toBe("nextra");
	});

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

describe("detectFramework", () => {
	it("runs all adapters and returns the best match", async () => {
		const tree = [{ path: "docs/readme.md" }];
		const adapter = await detectFramework(tree);
		expect(adapter.frameworkId).toBe("markdown");
	});

	it("accepts packageJson for dependency-based detection", async () => {
		const tree = [{ path: "package.json" }, { path: "next.config.mjs" }];
		const packageJson = JSON.stringify({
			dependencies: { nextra: "^2.0.0" },
		});
		const adapter = await detectFramework(tree, packageJson);
		expect(adapter.frameworkId).toBe("nextra");
	});

	it("falls back to markdown when packageJson has no matching deps", async () => {
		const tree = [{ path: "docs/intro.md" }];
		const packageJson = JSON.stringify({ dependencies: {} });
		const adapter = await detectFramework(tree, packageJson);
		expect(adapter.frameworkId).toBe("markdown");
	});

	it("works without packageJson (structure-only detection)", async () => {
		const tree = [{ path: "content/docs/getting-started.mdx" }];
		const packageJson = JSON.stringify({
			dependencies: { "fumadocs-core": "^2.0.0" },
		});
		const adapter = await detectFramework(tree, packageJson);
		expect(adapter.frameworkId).toBe("fumadocs");
	});
});
