import { describe, expect, it } from "vitest";

import { nextraAdapter } from "../nextra.js";
import { detectAdapter } from "../registry.js";
import {
	NEXTRA_DOC_FILES,
	NEXTRA_PACKAGE_JSON,
	NEXTRA_PACKAGE_JSON_THEME_ONLY,
	NEXTRA_TREE,
	NON_NEXTRA_PACKAGE_JSON,
} from "./fixtures/nextra.js";

describe("nextraAdapter.detect", () => {
	it("returns true when package.json has nextra dependency", async () => {
		const tree = NEXTRA_TREE.map((f) => ({ path: f.path }));
		const context = { packageJson: NEXTRA_PACKAGE_JSON };
		expect(await nextraAdapter.detect(tree, context)).toBe(true);
	});

	it("returns true when package.json has nextra-theme-docs only", async () => {
		const tree = NEXTRA_TREE.map((f) => ({ path: f.path }));
		const context = { packageJson: NEXTRA_PACKAGE_JSON_THEME_ONLY };
		expect(await nextraAdapter.detect(tree, context)).toBe(true);
	});

	it("returns false when package.json has no nextra deps", async () => {
		const tree = NEXTRA_TREE.map((f) => ({ path: f.path }));
		const context = { packageJson: NON_NEXTRA_PACKAGE_JSON };
		expect(await nextraAdapter.detect(tree, context)).toBe(true);
	});

	it("returns false when package.json has no nextra deps and structure is not nextra", async () => {
		const tree = [{ path: "docs/readme.md" }, { path: "next.config.js" }];
		const context = { packageJson: NON_NEXTRA_PACKAGE_JSON };
		expect(await nextraAdapter.detect(tree, context)).toBe(false);
	});

	it("returns true when next.config exists and _meta.json in docs structure", async () => {
		const tree = NEXTRA_TREE.map((f) => ({ path: f.path }));
		expect(await nextraAdapter.detect(tree)).toBe(true);
	});

	it("returns false when no next.config and no package.json context", async () => {
		const tree = [{ path: "pages/docs/_meta.json" }, { path: "pages/docs/index.mdx" }];
		expect(await nextraAdapter.detect(tree)).toBe(false);
	});

	it("returns false for plain docs repo without nextra", async () => {
		const tree = [{ path: "docs/readme.md" }, { path: "package.json" }];
		expect(await nextraAdapter.detect(tree)).toBe(false);
	});

	it("does not match non-meta files that only contain _meta.json in the filename", async () => {
		const tree = [
			{ path: "next.config.mjs" },
			{ path: "pages/docs/index.mdx" },
			{ path: "pages/docs/not_meta.json.bak" },
		];
		expect(await nextraAdapter.detect(tree)).toBe(false);
	});
});

describe("nextraAdapter.getDocPaths", () => {
	it("returns default pages/docs paths when config has no path", () => {
		const paths = nextraAdapter.getDocPaths({});
		expect(paths).toContain("pages/docs/**/*.md");
		expect(paths).toContain("pages/docs/**/*.mdx");
		expect(paths).toContain("pages/docs/**/_meta.json");
	});

	it("uses config.path when provided", () => {
		const paths = nextraAdapter.getDocPaths({ path: "content/docs" });
		expect(paths).toContain("content/docs/**/*.mdx");
		expect(paths).toContain("content/docs/**/_meta.json");
	});
});

describe("nextraAdapter.parseStructure", () => {
	it("parses _meta.json for page ordering and hierarchy", () => {
		const tree = nextraAdapter.parseStructure(NEXTRA_DOC_FILES);
		expect(tree.roots).toHaveLength(3);

		const intro = tree.roots.find((n) => n.title === "Introduction");
		expect(intro?.path).toBe("pages/docs/index.mdx");
		expect(intro?.children).toBeUndefined();

		const gettingStarted = tree.roots.find((n) => n.title === "Getting Started");
		expect(gettingStarted?.path).toBe("pages/docs/getting-started.mdx");

		const guides = tree.roots.find((n) => n.title === "Guides");
		expect(guides?.children).toBeDefined();
		expect(guides?.children).toHaveLength(2);
		const install = guides?.children?.find((n) => n.title === "Installation");
		expect(install?.path).toBe("pages/docs/guides/installation.mdx");
		const usage = guides?.children?.find((n) => n.title === "Usage");
		expect(usage?.path).toBe("pages/docs/guides/usage.mdx");
	});

	it("uses H1 from content when available", () => {
		const files = [
			{
				path: "pages/docs/custom.mdx",
				content: `---
title: Meta Title
description: Desc
---

# Actual H1 Title

Content.
`,
			},
		];
		const tree = nextraAdapter.parseStructure(files);
		expect(tree.roots[0]?.title).toBe("Actual H1 Title");
	});

	it("normalizes heading anchors by collapsing and trimming hyphens", () => {
		const files = [
			{
				path: "pages/docs/headings.mdx",
				content: `---
title: Heading Page
description: Heading examples
---

# Heading Page

## Hello - World
## - Leading And Trailing -
`,
			},
		];

		const tree = nextraAdapter.parseStructure(files);
		const childPaths = tree.roots[0]?.children?.map((child) => child.path) ?? [];
		expect(childPaths).toContain("pages/docs/headings.mdx#hello-world");
		expect(childPaths).toContain("pages/docs/headings.mdx#leading-and-trailing");
	});

	it("keeps section path when section has index page and children", () => {
		const files = [
			{
				path: "pages/docs/_meta.json",
				content: JSON.stringify({ guides: "Guides" }),
			},
			{
				path: "pages/docs/guides/_meta.json",
				content: JSON.stringify({ index: "Overview", install: "Install" }),
			},
			{
				path: "pages/docs/guides/index.mdx",
				content: "---\ntitle: Guides\ndescription: Overview\n---\n\n# Guides",
			},
			{
				path: "pages/docs/guides/install.mdx",
				content: "---\ntitle: Install\ndescription: Install steps\n---\n\n# Install",
			},
		];
		const tree = nextraAdapter.parseStructure(files);
		expect(tree.roots).toHaveLength(1);
		expect(tree.roots[0]?.title).toBe("Guides");
		expect(tree.roots[0]?.path).toBe("pages/docs/guides/index.mdx");
		expect(tree.roots[0]?.children).toHaveLength(2);
	});
});

describe("nextraAdapter.getConventions", () => {
	it("returns Nextra-specific conventions", () => {
		const conv = nextraAdapter.getConventions();
		expect(conv.frontmatterFormat).toBe("yaml");
		expect(conv.componentPatterns).toContain("<Callout>");
		expect(conv.componentPatterns).toContain("<Tabs>");
		expect(conv.componentPatterns).toContain("<Steps>");
		expect(conv.description).toContain("Nextra");
	});
});

describe("nextraAdapter.validateOutput", () => {
	it("returns valid for content with required frontmatter", () => {
		const content = `---
title: My Page
description: A description here
---

# Content

Valid.
`;
		const result = nextraAdapter.validateOutput(content, "pages/docs/page.mdx");
		expect(result.valid).toBe(true);
	});

	it("returns invalid when frontmatter missing title", () => {
		const content = `---
description: Only description
---

# Content
`;
		const result = nextraAdapter.validateOutput(content, "pages/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Frontmatter must include 'title'");
	});

	it("returns invalid when frontmatter missing description", () => {
		const content = `---
title: My Title
---

# Content
`;
		const result = nextraAdapter.validateOutput(content, "pages/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Frontmatter must include 'description'");
	});

	it("returns invalid when no frontmatter", () => {
		const content = "# Title\n\nContent.";
		const result = nextraAdapter.validateOutput(content, "pages/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Nextra pages require YAML frontmatter (--- ... ---)");
	});

	it("returns invalid for empty content", () => {
		const result = nextraAdapter.validateOutput("", "pages/docs/page.mdx");
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
		const result = nextraAdapter.validateOutput(content, "pages/docs/page.mdx");
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Content contains an unclosed code fence");
	});

	it("ignores markdown links inside fenced code blocks", () => {
		const content = `---
title: Page
description: Desc
---

\`\`\`md
[Broken Example](./missing.mdx)
\`\`\`
`;
		const result = nextraAdapter.validateOutput(content, "pages/docs/page.mdx", {
			repoFilePaths: ["pages/docs/page.mdx"],
		});
		expect(result.valid).toBe(true);
	});

	it("still validates markdown links outside fenced code blocks", () => {
		const content = `---
title: Page
description: Desc
---

[Broken Example](./missing.mdx)
`;
		const result = nextraAdapter.validateOutput(content, "pages/docs/page.mdx", {
			repoFilePaths: ["pages/docs/page.mdx"],
		});
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("Broken relative link: ./missing.mdx");
	});
});

describe("detectAdapter with Nextra", () => {
	it("returns nextra adapter when package.json has nextra", async () => {
		const tree = NEXTRA_TREE.map((f) => ({ path: f.path }));
		const adapter = await detectAdapter(tree, { packageJson: NEXTRA_PACKAGE_JSON });
		expect(adapter.frameworkId).toBe("nextra");
	});

	it("returns nextra adapter when next.config + _meta structure exists", async () => {
		const tree = NEXTRA_TREE.map((f) => ({ path: f.path }));
		const adapter = await detectAdapter(tree);
		expect(adapter.frameworkId).toBe("nextra");
	});

	it("falls back to markdown when no nextra detected", async () => {
		const tree = [{ path: "docs/readme.md" }];
		const adapter = await detectAdapter(tree, { packageJson: NON_NEXTRA_PACKAGE_JSON });
		expect(adapter.frameworkId).toBe("markdown");
	});
});
