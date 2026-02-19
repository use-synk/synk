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

const DEFAULT_DOCS_PATH = "pages/docs";
const NEXTRA_DEPS = ["nextra", "nextra-theme-docs"] as const;
const META_FILENAME = "_meta.json";

type MetaValue = string | { title?: string; display?: string; href?: string; type?: string };
const isMetaFilePath = (path: string): boolean =>
	path === META_FILENAME || path.endsWith(`/${META_FILENAME}`);

const hasNextraInDeps = (packageJson: string): boolean => {
	try {
		const pkg = JSON.parse(packageJson) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const deps = {
			...pkg.dependencies,
			...pkg.devDependencies,
		};
		return NEXTRA_DEPS.some((dep) => dep in deps);
	} catch {
		return false;
	}
};

const hasNextraConfig = (tree: RepoFile[]): boolean =>
	tree.some(
		(f) =>
			f.path === "next.config.mjs" || f.path === "next.config.js" || f.path === "next.config.ts",
	);

const hasNextraStructure = (tree: RepoFile[]): boolean => {
	const hasDocs = tree.some(
		(f) =>
			f.path.startsWith("pages/docs/") || f.path.startsWith("content/") || f.path === "pages/docs",
	);
	const hasMeta = tree.some(
		(f) => (f.path.startsWith("pages/docs/") || f.path.startsWith("content/")) && isMetaFilePath(f.path),
	);
	return hasDocs && hasMeta;
};

const parseMetaJson = (content: string): Record<string, MetaValue> | null => {
	try {
		const parsed = JSON.parse(content) as unknown;
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, MetaValue>;
		}
	} catch {
		// ignore
	}
	return null;
};

const metaValueToTitle = (value: MetaValue): string | null => {
	if (typeof value === "string") {
		return value;
	}
	if (value !== null && typeof value === "object" && "title" in value) {
		return typeof value.title === "string" ? value.title : null;
	}
	return null;
};

const isHiddenInMeta = (value: MetaValue): boolean => {
	if (typeof value === "string") {
		return false;
	}
	return (value as { display?: string })?.display === "hidden";
};

const isExternalLink = (value: MetaValue): boolean =>
	typeof value === "object" && value !== null && "href" in value;

const extractFrontmatter = (content: string): { title?: string; description?: string } | null => {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (match === null) {
		return null;
	}
	const block = match[1];
	if (block === undefined) {
		return null;
	}
	const result: { title?: string; description?: string } = {};
	for (const line of block.split("\n")) {
		const titleMatch = line.match(/^title:\s*(.+)$/);
		if (titleMatch) {
			const val = titleMatch[1]?.trim().replace(/^["']|["']$/g, "");
			if (val !== undefined && val !== "") result.title = val;
			continue;
		}
		const descMatch = line.match(/^description:\s*(.+)$/);
		if (descMatch) {
			const val = descMatch[1]?.trim().replace(/^["']|["']$/g, "");
			if (val !== undefined && val !== "") result.description = val;
		}
	}
	return result;
};

const pathToTitle = (path: string): string => {
	const baseName = path.split("/").pop() ?? path;
	return baseName.replace(/\.(md|mdx)$/i, "").replace(/-/g, " ");
};

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

const hasUnclosedCodeFence = (content: string): boolean => {
	let activeFence: string | undefined;
	for (const line of content.split("\n")) {
		activeFence = updateCodeFenceState(activeFence, line);
	}
	return activeFence !== undefined;
};

const slugifyHeading = (title: string): string =>
	title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

type MarkdownHeading = { level: number; title: string };

const extractHeadings = (content: string): MarkdownHeading[] => {
	const headings: MarkdownHeading[] = [];
	let activeFence: string | undefined;
	for (const line of content.split("\n")) {
		activeFence = updateCodeFenceState(activeFence, line);
		if (activeFence !== undefined) {
			continue;
		}
		const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
		const title = m?.[2]?.trim();
		const level = m?.[1]?.length;
		if (title !== undefined && level !== undefined) {
			headings.push({ level, title });
		}
	}
	return headings;
};

const getHeadingParent = (
	stack: Array<{ level: number; node: DocTreeNode }>,
	fileNode: DocTreeNode,
	level: number,
): DocTreeNode => {
	while (stack.length > 0) {
		const top = stack[stack.length - 1];
		if (top !== undefined && top.level < level) {
			return top.node;
		}
		stack.pop();
	}
	return fileNode;
};

const addHeadingChildren = (
	fileNode: DocTreeNode,
	headings: MarkdownHeading[],
	filePath: string,
): void => {
	const stack: Array<{ level: number; node: DocTreeNode }> = [];
	for (const [i, h] of headings.entries()) {
		const parent = getHeadingParent(stack, fileNode, h.level);
		const anchor = slugifyHeading(h.title);
		const node: DocTreeNode = {
			title: h.title,
			path: anchor ? `${filePath}#${anchor}` : filePath,
			order: i,
		};
		if (parent.children === undefined) {
			parent.children = [];
		}
		parent.children.push(node);
		stack.push({ level: h.level, node });
	}
};

const extractMarkdownLinks = (content: string): string[] => {
	const links: string[] = [];
	const linkRegex = /\[([^\]]+)\]\(([^)]*)\)/g;
	let activeFence: string | undefined;

	for (const line of content.split("\n")) {
		const nextFenceState = updateCodeFenceState(activeFence, line);
		if (nextFenceState !== activeFence) {
			activeFence = nextFenceState;
			continue;
		}

		if (activeFence !== undefined) {
			continue;
		}

		for (const match of line.matchAll(linkRegex)) {
			const href = match[2]?.trim();
			if (href !== undefined) {
				links.push(href);
			}
		}
	}

	return links;
};

const buildTreeFromMeta = (
	metaByDir: Map<string, Record<string, MetaValue>>,
	docFilesByDir: Map<string, DocFile[]>,
	dirPath: string,
): DocTreeNode[] => {
	const meta = metaByDir.get(dirPath);
	const docFiles = docFilesByDir.get(dirPath) ?? [];
	const docByKey = new Map<string, DocFile>();
	for (const f of docFiles) {
		const name =
			f.path
				.split("/")
				.pop()
				?.replace(/\.(md|mdx)$/i, "") ?? "";
		docByKey.set(name, f);
	}

	const orderedKeys = meta !== undefined ? Object.keys(meta) : [];
	const seen = new Set<string>();
	const nodes: DocTreeNode[] = [];

	for (const key of orderedKeys) {
		if (seen.has(key)) continue;
		seen.add(key);
		const value = meta?.[key];
		if (value !== undefined && isHiddenInMeta(value)) {
			continue;
		}
		if (value !== undefined && isExternalLink(value)) {
			continue;
		}
		const title = metaValueToTitle(value ?? "") ?? key.replace(/-/g, " ");
		const subDirPath = dirPath ? `${dirPath}/${key}` : key;
		const nestedMeta = metaByDir.get(subDirPath);
		const nestedDocs = docFilesByDir.get(subDirPath);

		if (nestedMeta !== undefined || (nestedDocs !== undefined && nestedDocs.length > 0)) {
			const children = buildTreeFromMeta(metaByDir, docFilesByDir, subDirPath);
			if (children.length > 0) {
				const node: DocTreeNode = { title, children, order: nodes.length };
				const nestedIndexDoc = nestedDocs?.find((f) => /\/index\.(md|mdx)$/i.test(f.path));
				if (nestedIndexDoc?.path !== undefined) {
					node.path = nestedIndexDoc.path;
				}
				nodes.push(node);
			} else {
				const indexDoc = docByKey.get("index") ?? docByKey.get(key);
				const node: DocTreeNode = { title, order: nodes.length };
				if (indexDoc?.path !== undefined) node.path = indexDoc.path;
				nodes.push(node);
			}
		} else {
			const doc = docByKey.get(key) ?? docByKey.get("index");
			const fileNode: DocTreeNode = { title, order: nodes.length };
			if (doc?.path !== undefined) fileNode.path = doc.path;
			if (doc !== undefined) {
				const headings = extractHeadings(doc.content);
				const h1 = headings.find((h) => h.level === 1);
				fileNode.title = h1?.title ?? title;
				addHeadingChildren(
					fileNode,
					headings.filter((h) => h !== h1),
					doc.path,
				);
			}
			nodes.push(fileNode);
		}
	}

	for (const [key, doc] of docByKey) {
		if (seen.has(key)) continue;
		const title = pathToTitle(doc.path);
		const fileNode: DocTreeNode = { title, path: doc.path, order: nodes.length };
		const headings = extractHeadings(doc.content);
		const h1 = headings.find((h) => h.level === 1);
		fileNode.title = h1?.title ?? title;
		addHeadingChildren(
			fileNode,
			headings.filter((h) => h !== h1),
			doc.path,
		);
		nodes.push(fileNode);
	}

	return nodes;
};

const isExternalLinkHref = (href: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(href);

const normalizePath = (path: string): string | undefined => {
	const segments = path.split("/").filter((s) => s.length > 0);
	const out: string[] = [];
	for (const s of segments) {
		if (s === ".") continue;
		if (s === "..") {
			if (out.length === 0) return undefined;
			out.pop();
			continue;
		}
		out.push(s);
	}
	return out.join("/");
};

const resolveLinkPath = (href: string, filePath: string): string | undefined => {
	const target = href.split(/[?#]/, 1)[0]?.trim() ?? "";
	if (target.length === 0) return "";
	const dir = filePath.split("/").slice(0, -1).filter(Boolean).join("/");
	const combined = dir ? `${dir}/${target}` : target;
	return target.startsWith("/") ? normalizePath(target.slice(1)) : normalizePath(combined);
};

const toPathSet = (ctx?: ValidationContext): Set<string> => {
	const paths = ctx?.repoFilePaths ?? [];
	return new Set(paths.map((p) => normalizePath(p)).filter((p): p is string => p !== undefined));
};

const getLinkCandidates = (resolved: string): string[] => {
	if (/\.(md|mdx)$/i.test(resolved)) return [resolved];
	return [
		resolved,
		`${resolved}.md`,
		`${resolved}.mdx`,
		`${resolved}/index.md`,
		`${resolved}/index.mdx`,
	];
};

const isBrokenLink = (href: string, filePath: string, known: Set<string>): boolean => {
	if (href.startsWith("#") || isExternalLinkHref(href)) return false;
	const resolved = resolveLinkPath(href, filePath);
	if (resolved === "" || resolved === undefined) return resolved === undefined;
	if (known.size === 0) return false;
	return !getLinkCandidates(resolved).some((c) => known.has(c));
};

export const nextraAdapter: DocAdapter = {
	frameworkId: "nextra",

	async detect(tree: RepoFile[], context?: DetectionContext): Promise<boolean> {
		if (context?.packageJson !== undefined && hasNextraInDeps(context.packageJson)) {
			return true;
		}
		return hasNextraConfig(tree) && hasNextraStructure(tree);
	},

	getDocPaths(config: DocsConfig): string[] {
		const base = config.path ?? DEFAULT_DOCS_PATH;
		return [
			`${base}/**/*.md`,
			`${base}/**/*.mdx`,
			`${base}/**/${META_FILENAME}`,
			"content/**/*.md",
			"content/**/*.mdx",
			"content/**/_meta.json",
		];
	},

	parseStructure(files: DocFile[]): DocTree {
		const metaByDir = new Map<string, Record<string, MetaValue>>();
		const docFilesByDir = new Map<string, DocFile[]>();

		const isDocFile = (path: string): boolean =>
			/\.(md|mdx)$/i.test(path) && !path.includes(META_FILENAME);

		let docsRoot = "";

		for (const f of files) {
			if (isMetaFilePath(f.path)) {
				const meta = parseMetaJson(f.content);
				if (meta !== null) {
					const dir = f.path.slice(0, -META_FILENAME.length - 1);
					metaByDir.set(dir, meta);
					if (docsRoot === "" || dir.split("/").length < docsRoot.split("/").length) {
						docsRoot = dir;
					}
				}
				continue;
			}
			if (!isDocFile(f.path)) continue;

			const segments = f.path.split("/").filter(Boolean);
			segments.pop();
			const dir = segments.join("/");
			const list = docFilesByDir.get(dir) ?? [];
			list.push(f);
			docFilesByDir.set(dir, list);
			if (docsRoot === "" || dir.split("/").length < docsRoot.split("/").length) {
				docsRoot = dir;
			}
		}

		const roots = buildTreeFromMeta(metaByDir, docFilesByDir, docsRoot);
		return { roots };
	},

	getConventions(): FrameworkConventions {
		return {
			frontmatterFormat: "yaml",
			componentPatterns: ["<Callout>", "<Tabs>", "<Steps>"],
			linkingConventions: ["relative paths", "next/link for internal navigation"],
			fileNamingRules: ["kebab-case", "index.mdx for directory index"],
			description: "Nextra MDX. Frontmatter: title, description. Components: Callout, Tabs, Steps.",
		};
	},

	validateOutput(content: string, filePath: string, context?: ValidationContext): ValidationResult {
		const errors: string[] = [];
		const known = toPathSet(context);

		if (content.trim().length === 0) {
			errors.push("Content must not be empty");
		}

		const frontmatter = extractFrontmatter(content);
		if (frontmatter === null) {
			errors.push("Nextra pages require YAML frontmatter (--- ... ---)");
		} else {
			if (frontmatter.title === undefined || frontmatter.title.length === 0) {
				errors.push("Frontmatter must include 'title'");
			}
			if (frontmatter.description === undefined || frontmatter.description.length === 0) {
				errors.push("Frontmatter must include 'description'");
			}
		}

		if (hasUnclosedCodeFence(content)) {
			errors.push("Content contains an unclosed code fence");
		}

		for (const href of extractMarkdownLinks(content)) {
			if (href.length === 0) {
				errors.push("Markdown links must include a non-empty target");
				continue;
			}
			if (href.toLowerCase().startsWith("javascript:")) {
				errors.push(`Unsupported link protocol: ${href}`);
			}
			if (isBrokenLink(href, filePath, known)) {
				errors.push(`Broken relative link: ${href}`);
			}
		}

		if (errors.length === 0) {
			return { valid: true };
		}
		return { valid: false, errors };
	},
};
