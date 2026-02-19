/**
 * Fixture data for Fumadocs adapter tests.
 * Simulates a real Fumadocs docs project structure.
 */

export const FUMADOCS_PACKAGE_JSON = JSON.stringify({
	name: "my-docs",
	dependencies: {
		next: "14.0.0",
		"fumadocs-core": "14.0.0",
		"fumadocs-ui": "14.0.0",
	},
});

export const FUMADOCS_PACKAGE_JSON_CORE_ONLY = JSON.stringify({
	name: "docs-site",
	dependencies: {
		"fumadocs-core": "13.0.0",
	},
});

export const FUMADOCS_PACKAGE_JSON_UI_ONLY = JSON.stringify({
	name: "docs-site",
	dependencies: {
		"fumadocs-ui": "14.0.0",
	},
});

export const NON_FUMADOCS_PACKAGE_JSON = JSON.stringify({
	name: "plain-site",
	dependencies: {
		next: "14.0.0",
	},
});

export const FUMADOCS_TREE: Array<{ path: string }> = [
	{ path: "package.json" },
	{ path: "source.config.ts" },
	{ path: "content/docs/meta.json" },
	{ path: "content/docs/index.mdx" },
	{ path: "content/docs/getting-started.mdx" },
	{ path: "content/docs/guides/meta.json" },
	{ path: "content/docs/guides/installation.mdx" },
	{ path: "content/docs/guides/usage.mdx" },
];

export const FUMADOCS_DOC_FILES = [
	{
		path: "content/docs/meta.json",
		content: JSON.stringify({
			title: "Documentation",
			pages: ["index", "getting-started", "guides"],
		}),
	},
	{
		path: "content/docs/index.mdx",
		content: `---
title: Introduction
description: Welcome to our documentation
icon: Home
---

# Introduction

Welcome to the docs.
`,
	},
	{
		path: "content/docs/getting-started.mdx",
		content: `---
title: Getting Started
description: How to get started quickly
icon: Rocket
---

# Getting Started

Follow these steps.
`,
	},
	{
		path: "content/docs/guides/meta.json",
		content: JSON.stringify({
			title: "Guides",
			icon: "Book",
			pages: ["installation", "usage"],
		}),
	},
	{
		path: "content/docs/guides/installation.mdx",
		content: `---
title: Installation
description: Install the package
---

# Installation

\`\`\`bash
npm install
\`\`\`
`,
	},
	{
		path: "content/docs/guides/usage.mdx",
		content: `---
title: Usage
description: How to use the library
---

# Usage

<Callout type="info">
  Use the API like this.
</Callout>
`,
	},
];
