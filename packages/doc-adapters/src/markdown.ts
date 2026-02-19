import type { DocAdapter } from "./adapter.js";
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
} from "./types.js";

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

type MarkdownHeading = {
	level: number;
	title: string;
};

const pathToTitle = (path: string): string => {
	const baseName = path.split("/").pop() ?? path;
	return baseName.replace(/\.(md|mdx)$/i, "").replace(/-/g, " ");
};

const segmentToTitle = (segment: string): string => segment.replace(/-/g, " ");

const slugifyHeading = (title: string): string =>
	title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-");

const updateCodeFenceState = (
	activeFence: string | undefined,
	line: string,
): string | undefined => {
	const fenceMatch = line.trim().match(/^(```+|~~~+)/);
	const fence = fenceMatch?.[1];
	if (fence === undefined) {
		return activeFence;
	}

	if (activeFence === undefined) {
		return fence;
	}

	if (activeFence[0] === fence[0] && fence.length >= activeFence.length) {
		return undefined;
	}

	return activeFence;
};

const extractHeadings = (content: string): MarkdownHeading[] => {
	const headings: MarkdownHeading[] = [];
	const lines = content.split("\n");
	let activeFence: string | undefined;

	for (const line of lines) {
		const nextFenceState = updateCodeFenceState(activeFence, line);
		if (nextFenceState !== activeFence) {
			activeFence = nextFenceState;
			continue;
		}

		if (activeFence !== undefined) {
			continue;
		}

		const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
		const title = headingMatch?.[2]?.trim();
		const level = headingMatch?.[1]?.length;
		if (title === undefined || title.length === 0 || level === undefined) {
			continue;
		}

		headings.push({ level, title });
	}

	return headings;
};

const getHeadingParent = (
	headingStack: Array<{ level: number; node: DocTreeNode }>,
	fileNode: DocTreeNode,
	level: number,
): DocTreeNode => {
	while (headingStack.length > 0) {
		const current = headingStack[headingStack.length - 1];
		if (current !== undefined && current.level < level) {
			return current.node;
		}
		headingStack.pop();
	}
	return fileNode;
};

const addHeadingChildren = (
	fileNode: DocTreeNode,
	headings: MarkdownHeading[],
	filePath: string,
): void => {
	if (headings.length === 0) {
		return;
	}

	const headingStack: Array<{ level: number; node: DocTreeNode }> = [];
	for (const [headingIndex, heading] of headings.entries()) {
		const parent = getHeadingParent(headingStack, fileNode, heading.level);
		const anchor = slugifyHeading(heading.title);
		const node: DocTreeNode = {
			title: heading.title,
			path: anchor.length > 0 ? `${filePath}#${anchor}` : filePath,
			order: headingIndex,
		};
		if (parent.children === undefined) {
			parent.children = [];
		}
		parent.children.push(node);
		headingStack.push({ level: heading.level, node });
	}
};

const hasUnclosedCodeFence = (content: string): boolean => {
	let activeFence: string | undefined;
	const lines = content.split("\n");
	for (const line of lines) {
		activeFence = updateCodeFenceState(activeFence, line);
	}
	return activeFence !== undefined;
};

const isExternalLink = (href: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(href);
const hasMarkdownExtension = (path: string): boolean => /\.(md|mdx)$/i.test(path);

const toPathSet = (context?: ValidationContext): Set<string> => {
	const paths = context?.repoFilePaths ?? [];
	const normalizedPaths = paths
		.map((path) => normalizePath(path))
		.filter((path): path is string => path !== undefined);
	return new Set(normalizedPaths);
};

const normalizePath = (path: string): string | undefined => {
	const segments = path.split("/").filter((segment) => segment.length > 0);
	const normalized: string[] = [];
	for (const segment of segments) {
		if (segment === ".") {
			continue;
		}
		if (segment === "..") {
			if (normalized.length === 0) {
				return undefined;
			}
			normalized.pop();
			continue;
		}
		normalized.push(segment);
	}
	return normalized.join("/");
};

const resolveLinkPath = (href: string, filePath: string): string | undefined => {
	const targetPath = href.split(/[?#]/, 1)[0]?.trim() ?? "";
	if (targetPath.length === 0) {
		return "";
	}

	const fileDirectoryPath = filePath
		.split("/")
		.slice(0, -1)
		.filter((segment) => segment.length > 0)
		.join("/");

	if (targetPath.startsWith("/")) {
		return normalizePath(targetPath.slice(1));
	}

	const combinedPath =
		fileDirectoryPath.length === 0 ? targetPath : `${fileDirectoryPath}/${targetPath}`;
	return normalizePath(combinedPath);
};

const getLinkPathCandidates = (resolvedPath: string): string[] => {
	if (hasMarkdownExtension(resolvedPath)) {
		return [resolvedPath];
	}
	return [
		resolvedPath,
		`${resolvedPath}.md`,
		`${resolvedPath}.mdx`,
		`${resolvedPath}/index.md`,
		`${resolvedPath}/index.mdx`,
	];
};

const isBrokenRelativeLink = (
	href: string,
	filePath: string,
	knownRepoPaths: Set<string>,
): boolean => {
	if (href.startsWith("#") || isExternalLink(href)) {
		return false;
	}

	const resolvedPath = resolveLinkPath(href, filePath);
	if (resolvedPath === "") {
		return false;
	}

	if (resolvedPath === undefined) {
		return true;
	}

	if (knownRepoPaths.size === 0) {
		return false;
	}

	const candidates = getLinkPathCandidates(resolvedPath);
	return !candidates.some((candidate) => knownRepoPaths.has(candidate));
};

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

		const linkRegex = /\[([^\]]+)\]\(([^)]*)\)/g;
		for (const match of content.matchAll(linkRegex)) {
			const href = match[2]?.trim();
			if (href === undefined || href.length === 0) {
				errors.push("Markdown links must include a non-empty target.");
				continue;
			}

			if (href.toLowerCase().startsWith("javascript:")) {
				errors.push(`Unsupported link protocol: ${href}`);
			}

			if (isBrokenRelativeLink(href, filePath, knownRepoPaths)) {
				errors.push(`Broken relative link: ${href}`);
			}
		}

		if (hasUnclosedCodeFence(content)) {
			errors.push("Markdown contains an unclosed code fence.");
		}

		if (errors.length === 0) {
			return { valid: true };
		}
		return { valid: false, errors };
	},
};
