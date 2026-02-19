import { describe, expect, it } from "vitest";

import { markdownAdapter } from "../markdown.js";

describe("markdownAdapter.detect", () => {
	it("returns true when docs/ exists", async () => {
		const tree = [{ path: "docs/guide.md" }];
		expect(await markdownAdapter.detect(tree)).toBe(true);
	});

	it("returns true when README.md exists", async () => {
		const tree = [{ path: "README.md" }];
		expect(await markdownAdapter.detect(tree)).toBe(true);
	});

	it("returns true when .md files exist", async () => {
		const tree = [{ path: "api.md" }];
		expect(await markdownAdapter.detect(tree)).toBe(true);
	});

	it("returns false for repo with no doc files", async () => {
		const tree = [{ path: "src/index.ts" }, { path: "package.json" }];
		expect(await markdownAdapter.detect(tree)).toBe(false);
	});
});

describe("markdownAdapter.getDocPaths", () => {
	it("returns default paths when config has no path", () => {
		const paths = markdownAdapter.getDocPaths({});
		expect(paths).toContain("docs/**/*.md");
		expect(paths).toContain("docs/**/*.mdx");
		expect(paths).toContain("README.md");
	});

	it("uses config.path when provided", () => {
		const paths = markdownAdapter.getDocPaths({ path: "content/docs" });
		expect(paths).toContain("content/docs/**/*.md");
		expect(paths).toContain("content/docs/**/*.mdx");
	});
});

describe("markdownAdapter.parseStructure", () => {
	it("parses files into a hierarchical DocTree", () => {
		const files = [
			{ path: "docs/a.md", content: "# Getting Started\n\nContent here." },
			{ path: "docs/b.md", content: "# API Reference" },
		];
		const tree = markdownAdapter.parseStructure(files);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0]?.title).toBe("docs");
		expect(tree.roots[0]?.children).toHaveLength(2);
		expect(tree.roots[0]?.children?.[0]?.title).toBe("Getting Started");
		expect(tree.roots[0]?.children?.[0]?.path).toBe("docs/a.md");
		expect(tree.roots[0]?.children?.[1]?.title).toBe("API Reference");
	});

	it("falls back to path-derived title when no H1", () => {
		const files = [{ path: "docs/quick-start.md", content: "No heading here." }];
		const tree = markdownAdapter.parseStructure(files);
		expect(tree.roots[0]?.children?.[0]?.title).toBe("quick start");
	});

	it("nests sections for deeper paths", () => {
		const files = [{ path: "docs/guides/setup/install.md", content: "# Install" }];
		const tree = markdownAdapter.parseStructure(files);
		expect(tree.roots[0]?.title).toBe("docs");
		expect(tree.roots[0]?.children?.[0]?.title).toBe("guides");
		expect(tree.roots[0]?.children?.[0]?.children?.[0]?.title).toBe("setup");
		expect(tree.roots[0]?.children?.[0]?.children?.[0]?.children?.[0]?.title).toBe("Install");
	});
});

describe("markdownAdapter.getConventions", () => {
	it("returns FrameworkConventions", () => {
		const conv = markdownAdapter.getConventions();
		expect(conv.frontmatterFormat).toBe("yaml");
		expect(conv.linkingConventions).toContain("relative paths");
	});
});

describe("markdownAdapter.validateOutput", () => {
	it("returns valid for non-empty content", () => {
		const result = markdownAdapter.validateOutput("# Title\n\nContent.", "docs/a.md");
		expect(result.valid).toBe(true);
	});

	it("returns invalid for empty content", () => {
		const result = markdownAdapter.validateOutput("", "docs/a.md");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Content must not be empty");
	});

	it("returns invalid for whitespace-only content", () => {
		const result = markdownAdapter.validateOutput("   \n\t  ", "docs/a.md");
		expect(result.valid).toBe(false);
	});

	it("allows parent-relative and root-relative links", () => {
		const content = "# Title\n\n[Guide](../guide.md)\n[API](/api/reference)";
		const result = markdownAdapter.validateOutput(content, "docs/a.md");
		expect(result.valid).toBe(true);
	});

	it("rejects javascript links", () => {
		const content = "# Title\n\n[Bad](javascript:alert('xss'))";
		const result = markdownAdapter.validateOutput(content, "docs/a.md");
		expect(result.valid).toBe(false);
		expect(result.errors?.[0]).toContain("Unsupported link protocol");
	});
});
