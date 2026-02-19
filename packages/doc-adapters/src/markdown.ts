import type { DocAdapter } from "./adapter.js";
import type {
	DocFile,
	DocTree,
	DocTreeNode,
	DocsConfig,
	FrameworkConventions,
	RepoFile,
	ValidationResult,
} from "./types.js";

const DOCS_DIR = "docs";
const README = "README.md";
const MD_EXT = ".md";
const MDX_EXT = ".mdx";

const hasDocsDir = (tree: RepoFile[]): boolean =>
	tree.some((f) => f.path === DOCS_DIR || f.path.startsWith(`${DOCS_DIR}/`));

const hasReadme = (tree: RepoFile[]): boolean =>
	tree.some((f) => f.path === README || f.path.toLowerCase().endsWith("/readme.md"));

const hasMdFiles = (tree: RepoFile[]): boolean =>
	tree.some((f) => f.path.endsWith(MD_EXT) || f.path.endsWith(MDX_EXT));

const extractH1 = (content: string): string => {
	const match = content.match(/^#\s+(.+)$/m);
	const group = match?.[1];
	return group !== undefined ? group.trim() : "";
};

const pathToTitle = (path: string): string => {
	const baseName = path.split("/").pop() ?? path;
	return baseName.replace(/\.(md|mdx)$/i, "").replace(/-/g, " ");
};

export const markdownAdapter: DocAdapter = {
	frameworkId: "markdown",

	async detect(tree: RepoFile[]): Promise<boolean> {
		return hasDocsDir(tree) || hasReadme(tree) || hasMdFiles(tree);
	},

	getDocPaths(config: DocsConfig): string[] {
		const base = config.path ?? DOCS_DIR;
		return [`${base}/**/*${MD_EXT}`, `${base}/**/*${MDX_EXT}`, README];
	},

	parseStructure(files: DocFile[]): DocTree {
		const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
		const roots: DocTreeNode[] = sorted.map((f, i) => {
			const title = extractH1(f.content) || pathToTitle(f.path);
			return { title, path: f.path, order: i };
		});
		return { roots };
	},

	getConventions(): FrameworkConventions {
		return {
			frontmatterFormat: "yaml",
			componentPatterns: [],
			linkingConventions: ["relative paths", "standard markdown links"],
			fileNamingRules: ["kebab-case preferred", "index.md for directory index"],
			description: "Standard Markdown. No special frontmatter required.",
		};
	},

	validateOutput(content: string, _filePath: string): ValidationResult {
		const errors: string[] = [];

		if (content.trim().length === 0) {
			errors.push("Content must not be empty");
		}

		const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
		for (const match of content.matchAll(linkRegex)) {
			const href = match[2];
			if (href === undefined || href.startsWith("#")) continue;
			if (href.startsWith("http://") || href.startsWith("https://")) continue;
			if (href.includes("..") || href.startsWith("/")) {
				errors.push(`Suspicious relative link: ${href}`);
			}
		}

		if (errors.length === 0) {
			return { valid: true };
		}
		return { valid: false, errors };
	},
};
