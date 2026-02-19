/**
 * Fixture data for Nextra adapter tests.
 * Simulates a real Nextra docs project structure.
 */

export const NEXTRA_PACKAGE_JSON = JSON.stringify({
	name: "my-docs",
	dependencies: {
		next: "14.0.0",
		nextra: "2.8.0",
		"nextra-theme-docs": "2.8.0",
	},
});

export const NEXTRA_PACKAGE_JSON_THEME_ONLY = JSON.stringify({
	name: "docs-site",
	dependencies: {
		"nextra-theme-docs": "2.7.0",
	},
});

export const NON_NEXTRA_PACKAGE_JSON = JSON.stringify({
	name: "plain-site",
	dependencies: {
		next: "14.0.0",
	},
});

export const NEXTRA_TREE: Array<{ path: string }> = [
	{ path: "package.json" },
	{ path: "next.config.mjs" },
	{ path: "pages/docs/_meta.json" },
	{ path: "pages/docs/index.mdx" },
	{ path: "pages/docs/getting-started.mdx" },
	{ path: "pages/docs/guides/_meta.json" },
	{ path: "pages/docs/guides/installation.mdx" },
	{ path: "pages/docs/guides/usage.mdx" },
];

export const NEXTRA_DOC_FILES = [
	{
		path: "pages/docs/_meta.json",
		content: JSON.stringify({
			index: "Introduction",
			"getting-started": "Getting Started",
			guides: "Guides",
		}),
	},
	{
		path: "pages/docs/index.mdx",
		content: `---
title: Introduction
description: Welcome to our documentation
---

# Introduction

Welcome to the docs.
`,
	},
	{
		path: "pages/docs/getting-started.mdx",
		content: `---
title: Getting Started
description: How to get started quickly
---

# Getting Started

Follow these steps.
`,
	},
	{
		path: "pages/docs/guides/_meta.json",
		content: JSON.stringify({
			installation: "Installation",
			usage: "Usage",
		}),
	},
	{
		path: "pages/docs/guides/installation.mdx",
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
		path: "pages/docs/guides/usage.mdx",
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
