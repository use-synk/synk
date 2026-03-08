import type { DocAdapter } from "./adapter";
import {
	addHeadingChildren,
	extractHeadings,
	extractMarkdownLinks,
	hasUnclosedCodeFence,
	isBrokenLink,
	pathToTitle,
	toPathSet,
} from "./shared";
import type {
	DetectionContext,
	DocFile,
	DocTree,
	DocTreeNode,
	DocsConfig,
	FrameworkConventions,
	RepoFile,
	ValidationContext,
	ValidationResult,
} from "./types";

const DOCS_DIR = "docs";
const README = "README.md";
const MD_EXT = ".md";
const MDX_EXT = ".mdx";
const COMMON_DOC_PATH_PREFIXES = ["docs/", "doc/", "documentation/", "guides/", "guide/"];
const COMMON_DOC_FILENAMES = ["README.md", "CONTRIBUTING.md", "CHANGELOG.md", "docs.md"];

const hasDocsDir = (tree: RepoFile[]): boolean =>
	tree.some((f) => f.path === DOCS_DIR || f.path.startsWith(`${DOCS_DIR}/`));

const hasReadme = (tree: RepoFile[]): boolean =>
	tree.some((f) => f.path === README || f.path.toLowerCase().endsWith("/readme.md"));

const hasMdFilesInCommonLocations = (tree: RepoFile[]): boolean =>
	tree.some((file) => {
		const lowerPath = file.path.toLowerCase();
		const isMarkdown = lowerPath.endsWith(MD_EXT) || lowerPath.endsWith(MDX_EXT);
		if (!isMarkdown) {
			return false;
		}

		if (COMMON_DOC_PATH_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))) {
			return true;
		}

		if (!lowerPath.includes("/")) {
			return true;
		}

		const fileName = file.path.split("/").pop();
		if (fileName === undefined) {
			return false;
		}
		return COMMON_DOC_FILENAMES.some((name) => name.toLowerCase() === fileName.toLowerCase());
	});

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

	async detect(tree: RepoFile[], _context?: DetectionContext): Promise<boolean> {
		return hasDocsDir(tree) || hasReadme(tree) || hasMdFilesInCommonLocations(tree);
	},

	getDocPaths(config: DocsConfig): string[] {
		const base = config.path ?? DOCS_DIR;
		const basePaths = [`${base}/**/*${MD_EXT}`, `${base}/**/*${MDX_EXT}`];
		return config.path === undefined ? [...basePaths, README] : basePaths;
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

			const headings = extractHeadings(file.content);
			const h1 = headings.find((heading) => heading.level === 1);
			const fileNode: DocTreeNode = {
				title: h1?.title ?? pathToTitle(file.path),
				path: file.path,
				order: index,
			};

			const nestedHeadings =
				h1 === undefined ? headings : headings.filter((heading) => heading !== h1);
			addHeadingChildren(fileNode, nestedHeadings, file.path);
			parentNodes.push(fileNode);
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

	validateOutput(content: string, filePath: string, context?: ValidationContext): ValidationResult {
		const errors: string[] = [];
		const knownRepoPaths = toPathSet(context);

		if (content.trim().length === 0) {
			errors.push("Content must not be empty");
		}

		for (const href of extractMarkdownLinks(content)) {
			if (href.length === 0) {
				errors.push("Markdown links must include a non-empty target");
				continue;
			}

			if (href.toLowerCase().startsWith("javascript:")) {
				errors.push(`Unsupported link protocol: ${href}`);
			}

			if (isBrokenLink(href, filePath, knownRepoPaths)) {
				errors.push(`Broken relative link: ${href}`);
			}
		}

		if (hasUnclosedCodeFence(content)) {
			errors.push("Content contains an unclosed code fence");
		}

		if (errors.length === 0) {
			return { valid: true };
		}
		return { valid: false, errors };
	},
};
