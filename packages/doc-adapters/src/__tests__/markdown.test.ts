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

	it("returns true when markdown files exist in common doc locations", async () => {
		const tree = [{ path: "guides/api.md" }];
		expect(await markdownAdapter.detect(tree)).toBe(true);
	});

	it("returns false when markdown files only exist outside common doc locations", async () => {
		const tree = [{ path: "tmp/generated/notes.md" }];
		expect(await markdownAdapter.detect(tree)).toBe(false);
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

	it("parses heading hierarchy beneath each page", () => {
		const files = [
			{
				path: "docs/guide.md",
				content: "# Guide\n\n## Install\n\n### Linux\n\n## Usage",
			},
		];
		const tree = markdownAdapter.parseStructure(files);
		const guidePage = tree.roots[0]?.children?.[0];
		expect(guidePage?.title).toBe("Guide");
		expect(guidePage?.children?.[0]?.title).toBe("Install");
		expect(guidePage?.children?.[0]?.path).toBe("docs/guide.md#install");
		expect(guidePage?.children?.[0]?.children?.[0]?.title).toBe("Linux");
		expect(guidePage?.children?.[1]?.title).toBe("Usage");
	});

	it("preserves heading order from source markdown", () => {
		const files = [
			{
				path: "docs/guide.md",
				content: "# Guide\n\n## Zebra\n\n## Alpha",
			},
		];
		const tree = markdownAdapter.parseStructure(files);
		const guidePage = tree.roots[0]?.children?.[0];
		expect(guidePage?.children?.[0]?.title).toBe("Zebra");
		expect(guidePage?.children?.[1]?.title).toBe("Alpha");
	});

	it("does not close code fences with shorter markers when parsing headings", () => {
		const files = [
			{
				path: "docs/guide.md",
				content: "# Guide\n\n````ts\n# Inside code\n```\n## Also inside code\n````\n## Real section",
			},
		];
		const tree = markdownAdapter.parseStructure(files);
		const guidePage = tree.roots[0]?.children?.[0];
		expect(guidePage?.children).toHaveLength(1);
		expect(guidePage?.children?.[0]?.title).toBe("Real section");
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

	it("allows existing relative links when repository context is provided", () => {
		const content = "# Title\n\n[Guide](../guide.md)\n[Setup](setup)";
		const result = markdownAdapter.validateOutput(content, "docs/tutorials/a.md", {
			repoFilePaths: ["docs/guide.md", "docs/tutorials/setup/index.md"],
		});
		expect(result.valid).toBe(true);
	});

	it("rejects javascript links", () => {
		const content = "# Title\n\n[Bad](javascript:alert('xss'))";
		const result = markdownAdapter.validateOutput(content, "docs/a.md");
		expect(result.valid).toBe(false);
		expect(result.errors?.[0]).toContain("Unsupported link protocol");
	});

	it("rejects markdown links with empty hrefs", () => {
		const content = "# Title\n\n[Empty]()";
		const result = markdownAdapter.validateOutput(content, "docs/a.md");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Markdown links must include a non-empty target.");
	});

	it("rejects relative links that escape repository root", () => {
		const content = "# Title\n\n[Escapes](../../../outside.md)";
		const result = markdownAdapter.validateOutput(content, "docs/guides/a.md");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Broken relative link: ../../../outside.md");
	});

	it("rejects missing relative links when repository context is provided", () => {
		const content = "# Title\n\n[Missing](./missing.md)";
		const result = markdownAdapter.validateOutput(content, "docs/guides/a.md", {
			repoFilePaths: ["docs/guides/a.md", "docs/guides/intro.md"],
		});
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Broken relative link: ./missing.md");
	});

	it("rejects markdown with unclosed code fences", () => {
		const content = "# Title\n\n```ts\nconst a = 1;\n";
		const result = markdownAdapter.validateOutput(content, "docs/a.md");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Markdown contains an unclosed code fence.");
	});

	it("rejects when a shorter closing fence is used", () => {
		const content = "# Title\n\n````ts\nconst a = 1;\n```";
		const result = markdownAdapter.validateOutput(content, "docs/a.md");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Markdown contains an unclosed code fence.");
	});
});
