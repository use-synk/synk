import { describe, expect, it } from "vitest";

import { fumadocsAdapter } from "../fumadocs.js";
import { detectAdapter } from "../registry.js";
import {
	FUMADOCS_DOC_FILES,
	FUMADOCS_PACKAGE_JSON,
	FUMADOCS_PACKAGE_JSON_CORE_ONLY,
	FUMADOCS_PACKAGE_JSON_UI_ONLY,
	FUMADOCS_TREE,
	NON_FUMADOCS_PACKAGE_JSON,
} from "./fixtures/fumadocs.js";

describe("fumadocsAdapter.detect", () => {
	it("returns true when package.json has fumadocs-core dependency", async () => {
		const tree = FUMADOCS_TREE.map((f) => ({ path: f.path }));
		const context = { packageJson: FUMADOCS_PACKAGE_JSON };
		expect(await fumadocsAdapter.detect(tree, context)).toBe(true);
	});

	it("returns true when package.json has fumadocs-core only", async () => {
		const tree = FUMADOCS_TREE.map((f) => ({ path: f.path }));
		const context = { packageJson: FUMADOCS_PACKAGE_JSON_CORE_ONLY };
		expect(await fumadocsAdapter.detect(tree, context)).toBe(true);
	});

	it("returns true when package.json has fumadocs-ui only", async () => {
		const tree = FUMADOCS_TREE.map((f) => ({ path: f.path }));
		const context = { packageJson: FUMADOCS_PACKAGE_JSON_UI_ONLY };
		expect(await fumadocsAdapter.detect(tree, context)).toBe(true);
	});

	it("returns false when package.json has no fumadocs deps", async () => {
		const tree = [{ path: "content/docs/readme.mdx" }, { path: "source.config.ts" }];
		const context = { packageJson: NON_FUMADOCS_PACKAGE_JSON };
		expect(await fumadocsAdapter.detect(tree, context)).toBe(false);
	});

	it("returns true when source.config.ts exists and content/docs structure with meta.json", async () => {
		const tree = FUMADOCS_TREE.map((f) => ({ path: f.path }));
		expect(await fumadocsAdapter.detect(tree)).toBe(true);
	});

	it("returns true when source.config exists and docs directory is custom", async () => {
		const tree = [
			{ path: "source.config.ts" },
			{ path: "docs/content/meta.json" },
			{ path: "docs/content/index.mdx" },
		];
		expect(await fumadocsAdapter.detect(tree)).toBe(true);
	});

	it("returns false when no source.config and no package.json context", async () => {
		const tree = [{ path: "content/docs/meta.json" }, { path: "content/docs/index.mdx" }];
		expect(await fumadocsAdapter.detect(tree)).toBe(false);
	});

	it("returns false for plain docs repo without fumadocs", async () => {
		const tree = [{ path: "docs/readme.md" }, { path: "package.json" }];
		expect(await fumadocsAdapter.detect(tree, { packageJson: NON_FUMADOCS_PACKAGE_JSON })).toBe(
			false,
		);
	});
});

describe("fumadocsAdapter.getDocPaths", () => {
	it("returns default content/docs paths when config has no path", () => {
		const paths = fumadocsAdapter.getDocPaths({});
		expect(paths).toContain("content/docs/**/*.md");
		expect(paths).toContain("content/docs/**/*.mdx");
		expect(paths).toContain("content/docs/**/meta.json");
	});

	it("uses config.path when provided", () => {
		const paths = fumadocsAdapter.getDocPaths({ path: "docs" });
		expect(paths).toContain("docs/**/*.mdx");
		expect(paths).toContain("docs/**/meta.json");
	});

	it("extracts dir from sourceConfigContent when path is unset", () => {
		const paths = fumadocsAdapter.getDocPaths({
			sourceConfigContent: "export const docs = defineDocs({ dir: 'docs/content' });",
		});
		expect(paths).toContain("docs/content/**/*.mdx");
		expect(paths).toContain("docs/content/**/meta.json");
	});
});

describe("fumadocsAdapter.parseStructure", () => {
	it("parses meta.json for page ordering and hierarchy", () => {
		const tree = fumadocsAdapter.parseStructure(FUMADOCS_DOC_FILES);
		expect(tree.roots).toHaveLength(3);

		const intro = tree.roots.find((n) => n.title === "Introduction");
		expect(intro?.path).toBe("content/docs/index.mdx");
		expect(intro?.children).toBeUndefined();

		const gettingStarted = tree.roots.find((n) => n.title === "Getting Started");
		expect(gettingStarted?.path).toBe("content/docs/getting-started.mdx");

		const guides = tree.roots.find((n) => n.title === "Guides");
		expect(guides?.children).toBeDefined();
		expect(guides?.children).toHaveLength(2);
		const install = guides?.children?.find((n) => n.title === "Installation");
		expect(install?.path).toBe("content/docs/guides/installation.mdx");
		const usage = guides?.children?.find((n) => n.title === "Usage");
		expect(usage?.path).toBe("content/docs/guides/usage.mdx");
	});

	it("uses H1 from content when available", () => {
		const files = [
			{
				path: "content/docs/custom.mdx",
				content: `---
title: Meta Title
description: Desc
icon: File
---

# Actual H1 Title

Content.
`,
			},
		];
		const tree = fumadocsAdapter.parseStructure(files);
		expect(tree.roots[0]?.title).toBe("Actual H1 Title");
	});

	it("parses separator entries in meta.json", () => {
		const files = [
			{
				path: "content/docs/meta.json",
				content: JSON.stringify({
					pages: ["---Introduction---", "index", "---Guides---", "guides"],
				}),
			},
			{
				path: "content/docs/index.mdx",
				content: "---\ntitle: Intro\ndescription: D\n---\n\n# Intro",
			},
			{
				path: "content/docs/guides/meta.json",
				content: JSON.stringify({ pages: ["readme"] }),
			},
			{
				path: "content/docs/guides/readme.mdx",
				content: "---\ntitle: Guide\ndescription: D\n---\n\n# Guide",
			},
		];
		const tree = fumadocsAdapter.parseStructure(files);
		expect(tree.roots).toHaveLength(4);
		expect(tree.roots[0]?.title).toBe("Introduction");
		expect(tree.roots[0]?.path).toBeUndefined();
		expect(tree.roots[1]?.title).toBe("Intro");
		expect(tree.roots[2]?.title).toBe("Guides");
		expect(tree.roots[3]?.title).toBe("guides");
		expect(tree.roots[3]?.children).toHaveLength(1);
		expect(tree.roots[3]?.children?.[0]?.title).toBe("Guide");
	});

	it("does not recurse infinitely when docs are at repo root (empty dirPath)", () => {
		const files = [
			{ path: "meta.json", content: JSON.stringify({ pages: ["..."] }) },
			{
				path: "index.mdx",
				content: "---\ntitle: Root\ndescription: D\n---\n\n# Root",
			},
		];
		const tree = fumadocsAdapter.parseStructure(files);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0]?.title).toBe("Root");
	});

	it("keeps section path when section has index page and children", () => {
		const files = [
			{
				path: "content/docs/meta.json",
				content: JSON.stringify({ pages: ["guides"] }),
			},
			{
				path: "content/docs/guides/meta.json",
				content: JSON.stringify({ title: "Guides", pages: ["index", "install"] }),
			},
			{
				path: "content/docs/guides/index.mdx",
				content: "---\ntitle: Guides\ndescription: Overview\n---\n\n# Guides",
			},
			{
				path: "content/docs/guides/install.mdx",
				content: "---\ntitle: Install\ndescription: Install steps\n---\n\n# Install",
			},
		];
		const tree = fumadocsAdapter.parseStructure(files);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0]?.title).toBe("Guides");
		expect(tree.roots[0]?.path).toBe("content/docs/guides/index.mdx");
		expect(tree.roots[0]?.children).toHaveLength(2);
	});

	it("does not map unknown pages entries to index", () => {
		const files = [
			{
				path: "content/docs/meta.json",
				content: JSON.stringify({ pages: ["getting-started"] }),
			},
			{
				path: "content/docs/index.mdx",
				content: "---\ntitle: Intro\ndescription: D\n---\n\n# Intro",
			},
		];
		const tree = fumadocsAdapter.parseStructure(files);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0]?.title).toBe("Intro");
		expect(tree.roots[0]?.path).toBe("content/docs/index.mdx");
	});

	it("ignores malformed pages values in meta.json without throwing", () => {
		const files = [
			{
				path: "content/docs/meta.json",
				content: JSON.stringify({ pages: [123] }),
			},
			{
				path: "content/docs/a.mdx",
				content: "---\ntitle: A\ndescription: D\n---\n\n# A",
			},
		];
		const tree = fumadocsAdapter.parseStructure(files);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0]?.title).toBe("A");
		expect(tree.roots[0]?.path).toBe("content/docs/a.mdx");
	});
});

describe("fumadocsAdapter.getConventions", () => {
	it("returns Fumadocs-specific conventions", () => {
		const conv = fumadocsAdapter.getConventions();
		expect(conv.frontmatterFormat).toBe("yaml");
		expect(conv.componentPatterns).toContain("<Callout>");
		expect(conv.componentPatterns).toContain("<Tabs>");
		expect(conv.componentPatterns).toContain("<Steps>");
		expect(conv.componentPatterns).toContain("<Card>");
		expect(conv.description).toContain("Fumadocs");
		expect(conv.description).toContain("icon");
	});
});

describe("fumadocsAdapter.validateOutput", () => {
	it("returns valid for content with required frontmatter", () => {
		const content = `---
title: My Page
description: A description here
---

# Content

Valid.
`;
		const result = fumadocsAdapter.validateOutput(content, "content/docs/page.mdx");
		expect(result.valid).toBe(true);
	});

	it("returns invalid when frontmatter missing title", () => {
		const content = `---
description: Only description
---

# Content
`;
		const result = fumadocsAdapter.validateOutput(content, "content/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Frontmatter must include 'title'");
	});

	it("returns invalid when frontmatter missing description", () => {
		const content = `---
title: My Title
---

# Content
`;
		const result = fumadocsAdapter.validateOutput(content, "content/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Frontmatter must include 'description'");
	});

	it("returns invalid when no frontmatter", () => {
		const content = "# Title\n\nContent.";
		const result = fumadocsAdapter.validateOutput(content, "content/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Fumadocs pages require YAML frontmatter (--- ... ---)");
	});

	it("returns invalid for empty content", () => {
		const result = fumadocsAdapter.validateOutput("", "content/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Content must not be empty");
	});

	it("returns invalid for unclosed code fence", () => {
		const content = `---
title: Page
description: Desc
---

\`\`\`ts
const x = 1;
`;
		const result = fumadocsAdapter.validateOutput(content, "content/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Content contains an unclosed code fence");
	});

	it("does not validate image references as doc links", () => {
		const content = `---
title: Page
description: Desc
---

![diagram](./assets/diagram.png)
`;
		const result = fumadocsAdapter.validateOutput(content, "content/docs/page.mdx", {
			repoFilePaths: ["content/docs/page.mdx", "content/docs/other.mdx"],
		});
		expect(result.valid).toBe(true);
	});
});

describe("detectAdapter with Fumadocs", () => {
	it("returns fumadocs adapter when package.json has fumadocs-core", async () => {
		const tree = FUMADOCS_TREE.map((f) => ({ path: f.path }));
		const adapter = await detectAdapter(tree, { packageJson: FUMADOCS_PACKAGE_JSON });
		expect(adapter.frameworkId).toBe("fumadocs");
	});

	it("returns nextra adapter when both nextra and fumadocs present (nextra has priority)", async () => {
		const tree = FUMADOCS_TREE.map((f) => ({ path: f.path }));
		const packageJson = JSON.stringify({
			dependencies: { nextra: "2.8.0", "fumadocs-core": "14.0.0" },
		});
		const adapter = await detectAdapter(tree, { packageJson });
		expect(adapter.frameworkId).toBe("nextra");
	});

	it("returns fumadocs adapter when source.config + content/docs structure exists", async () => {
		const tree = FUMADOCS_TREE.map((f) => ({ path: f.path }));
		const adapter = await detectAdapter(tree);
		expect(adapter.frameworkId).toBe("fumadocs");
	});

	it("falls back to markdown when no fumadocs detected", async () => {
		const tree = [{ path: "docs/readme.md" }];
		const adapter = await detectAdapter(tree, { packageJson: NON_FUMADOCS_PACKAGE_JSON });
		expect(adapter.frameworkId).toBe("markdown");
	});
});
