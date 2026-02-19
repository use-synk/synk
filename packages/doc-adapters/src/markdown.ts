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

const segmentToTitle = (segment: string): string => segment.replace(/-/g, " ");

const sortNodes = (nodes: DocTreeNode[]): void => {
	nodes.sort((left, right) => {
		const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
		const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;

		if (leftOrder !== rightOrder) {
			return leftOrder - rightOrder;
		}

		return left.title.localeCompare(right.title);
	});

	for (const node of nodes) {
		if (node.children !== undefined) {
			sortNodes(node.children);
		}
	}
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
		const roots: DocTreeNode[] = [];
		const sectionsByPath = new Map<string, DocTreeNode>();

		for (const [index, file] of sorted.entries()) {
			const segments = file.path.split("/").filter((segment) => segment.length > 0);
			if (segments.length === 0) {
				continue;
			}

			const directorySegments = segments.slice(0, -1);
			let parentNodes = roots;
			let directoryKey = "";

			for (const segment of directorySegments) {
				directoryKey = directoryKey.length > 0 ? `${directoryKey}/${segment}` : segment;
				let section = sectionsByPath.get(directoryKey);

				if (section === undefined) {
					section = {
						title: segmentToTitle(segment),
						children: [],
						order: index,
					};
					sectionsByPath.set(directoryKey, section);
					parentNodes.push(section);
				}

				if (section.order === undefined || index < section.order) {
					section.order = index;
				}

				if (section.children === undefined) {
					section.children = [];
				}
				parentNodes = section.children;
			}

			parentNodes.push({
				title: extractH1(file.content) || pathToTitle(file.path),
				path: file.path,
				order: index,
			});
		}

		sortNodes(roots);
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
			const href = match[2]?.trim();
			if (href === undefined || href.length === 0) {
				errors.push("Markdown links must include a non-empty target.");
				continue;
			}

			if (href.toLowerCase().startsWith("javascript:")) {
				errors.push(`Unsupported link protocol: ${href}`);
			}
		}

		if (errors.length === 0) {
			return { valid: true };
		}
		return { valid: false, errors };
	},
};
