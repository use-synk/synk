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

const DEFAULT_DOCS_PATH = "content/docs";
const FUMADOCS_DEPS = ["fumadocs-core", "fumadocs-ui"] as const;
const META_FILENAME = "meta.json";

type FumadocsMeta = {
	title?: string;
	icon?: string;
	description?: string;
	pages?: string[];
};

const isMetaFilePath = (path: string): boolean =>
	path === META_FILENAME || path.endsWith(`/${META_FILENAME}`);

const hasFumadocsInDeps = (packageJson: string): boolean => {
	try {
		const pkg = JSON.parse(packageJson) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const deps = {
			...pkg.dependencies,
			...pkg.devDependencies,
		};
		return FUMADOCS_DEPS.some((dep) => dep in deps);
	} catch {
		return false;
	}
};

const hasSourceConfig = (tree: RepoFile[]): boolean =>
	tree.some(
		(f) =>
			f.path === "source.config.ts" ||
			f.path === "source.config.js" ||
			f.path === "source.config.mjs",
	);

const isMarkdownFilePath = (path: string): boolean => /\.(md|mdx)$/i.test(path);

const toDirectory = (path: string): string => {
	const slashIndex = path.lastIndexOf("/");
	if (slashIndex <= 0) {
		return "";
	}
	return path.slice(0, slashIndex);
};

const hasFumadocsStructure = (tree: RepoFile[]): boolean => {
	const metaDirs = new Set<string>();
	for (const file of tree) {
		if (!isMetaFilePath(file.path)) {
			continue;
		}
		metaDirs.add(toDirectory(file.path));
	}
	if (metaDirs.size === 0) {
		return false;
	}

	return tree.some((file) => {
		if (!isMarkdownFilePath(file.path)) {
			return false;
		}
		for (const dir of metaDirs) {
			if (file.path.startsWith(`${dir}/`)) {
				return true;
			}
		}
		return false;
	});
};

const parseMetaJson = (content: string): FumadocsMeta | null => {
	try {
		const parsed = JSON.parse(content) as unknown;
		if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
			const candidate = parsed as {
				title?: unknown;
				icon?: unknown;
				description?: unknown;
				pages?: unknown;
			};
			if (candidate.pages !== undefined) {
				if (!Array.isArray(candidate.pages)) {
					return null;
				}
				if (!candidate.pages.every((entry) => typeof entry === "string")) {
					return null;
				}
			}
			return {
				...(typeof candidate.title === "string" && { title: candidate.title }),
				...(typeof candidate.icon === "string" && { icon: candidate.icon }),
				...(typeof candidate.description === "string" && { description: candidate.description }),
				...(candidate.pages !== undefined && { pages: candidate.pages as string[] }),
			};
		}
	} catch {
		// ignore
	}
	return null;
};

const isSeparator = (entry: string): boolean =>
	typeof entry === "string" && entry.startsWith("---") && entry.endsWith("---");

const isRestEntry = (entry: string): boolean =>
	typeof entry === "string" && entry.startsWith("...");

const extractFrontmatter = (
	content: string,
): { title?: string; description?: string; icon?: string } | null => {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (match === null) {
		return null;
	}
	const block = match[1];
	if (block === undefined) {
		return null;
	}
	const result: { title?: string; description?: string; icon?: string } = {};
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
			continue;
		}
		const iconMatch = line.match(/^icon:\s*(.+)$/);
		if (iconMatch) {
			const val = iconMatch[1]?.trim().replace(/^["']|["']$/g, "");
			if (val !== undefined && val !== "") result.icon = val;
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

type MarkdownHeading = { level: number; title: string };

const slugifyHeading = (title: string): string =>
	title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

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
			if (typeof match.index === "number" && match.index > 0 && line[match.index - 1] === "!") {
				continue;
			}
			const href = match[2]?.trim();
			if (href !== undefined) {
				links.push(href);
			}
		}
	}

	return links;
};

const addPageOrFolderNode = (
	metaByDir: Map<string, FumadocsMeta>,
	docFilesByDir: Map<string, DocFile[]>,
	docByKey: Map<string, DocFile>,
	dirPath: string,
	key: string,
	order: number,
): DocTreeNode | null => {
	if (key.length === 0) return null;
	const subDirPath = dirPath ? `${dirPath}/${key}` : key;
	const nestedMeta = metaByDir.get(subDirPath);
	const nestedDocs = docFilesByDir.get(subDirPath) ?? [];
	const doc = docByKey.get(key);

	if (nestedMeta !== undefined || nestedDocs.length > 0) {
		const children = buildTreeFromMeta(metaByDir, docFilesByDir, subDirPath);
		const nestedIndexDoc = nestedDocs.find((f) => /\/index\.(md|mdx)$/i.test(f.path));
		const indexDoc = nestedIndexDoc ?? nestedDocs[0];

		if (children.length > 0) {
			const title = nestedMeta?.title ?? key.replace(/-/g, " ");
			const node: DocTreeNode = { title, children, order };
			if (indexDoc?.path !== undefined) node.path = indexDoc.path;
			return node;
		}
		const title = nestedMeta?.title ?? key.replace(/-/g, " ");
		const node: DocTreeNode = { title, order };
		if (indexDoc?.path !== undefined) node.path = indexDoc.path;
		return node;
	}
	if (doc === undefined) {
		return null;
	}

	const fileNode: DocTreeNode = {
		title: pathToTitle(doc.path),
		order,
		path: doc.path,
	};
	const headings = extractHeadings(doc.content);
	const h1 = headings.find((h) => h.level === 1);
	fileNode.title = h1?.title ?? fileNode.title;
	addHeadingChildren(
		fileNode,
		headings.filter((h) => h !== h1),
		doc.path,
	);
	return fileNode;
};

const buildTreeFromMeta = (
	metaByDir: Map<string, FumadocsMeta>,
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

	const pages = meta?.pages ?? [];
	const seen = new Set<string>();
	const nodes: DocTreeNode[] = [];

	const allKeys = new Set(docByKey.keys());
	const dirPrefix = dirPath ? `${dirPath}/` : "";
	const addFirstSegment = (subDir: string): void => {
		const firstSegment = subDir.slice(dirPath ? dirPath.length + 1 : 0).split("/")[0];
		if (firstSegment !== undefined && firstSegment.length > 0) {
			allKeys.add(firstSegment);
		}
	};
	for (const subDir of docFilesByDir.keys()) {
		if (subDir.startsWith(dirPrefix) || (dirPath === "" && subDir.includes("/"))) {
			addFirstSegment(subDir);
		}
	}
	for (const subDir of metaByDir.keys()) {
		if (subDir.startsWith(dirPrefix) || (dirPath === "" && subDir.includes("/"))) {
			addFirstSegment(subDir);
		}
	}

	for (let orderIndex = 0; orderIndex < pages.length; orderIndex++) {
		const entry = pages[orderIndex];
		if (entry === undefined) continue;

		if (isSeparator(entry)) {
			const label = entry.slice(3, -3).trim();
			if (label.length > 0) {
				nodes.push({ title: label, order: orderIndex });
			}
			continue;
		}

		if (isRestEntry(entry)) {
			const restFolder = entry === "..." ? null : entry.slice(3);
			const keysToAdd = [...allKeys]
				.filter(
					(k) =>
						!seen.has(k) &&
						(restFolder === null || k === restFolder || k.startsWith(`${restFolder}/`)),
				)
				.sort((a, b) => a.localeCompare(b));
			for (const key of keysToAdd) {
				seen.add(key);
				const node = addPageOrFolderNode(
					metaByDir,
					docFilesByDir,
					docByKey,
					dirPath,
					key,
					nodes.length,
				);
				if (node !== null) {
					nodes.push(node);
				}
			}
			continue;
		}

		if (seen.has(entry)) continue;
		seen.add(entry);

		const node = addPageOrFolderNode(
			metaByDir,
			docFilesByDir,
			docByKey,
			dirPath,
			entry,
			nodes.length,
		);
		if (node !== null) {
			nodes.push(node);
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

const extractDirFromSourceConfig = (content: string): string | null => {
	const match = content.match(/dir:\s*['"]([^'"]+)['"]/);
	return match?.[1] ?? null;
};

export const fumadocsAdapter: DocAdapter = {
	frameworkId: "fumadocs",

	async detect(tree: RepoFile[], context?: DetectionContext): Promise<boolean> {
		if (context?.packageJson !== undefined && hasFumadocsInDeps(context.packageJson)) {
			return true;
		}
		return hasSourceConfig(tree) && hasFumadocsStructure(tree);
	},

	getDocPaths(config: DocsConfig): string[] {
		let base = config.path;
		if (base === undefined && config.sourceConfigContent !== undefined) {
			base = extractDirFromSourceConfig(config.sourceConfigContent) ?? undefined;
		}
		base = base ?? DEFAULT_DOCS_PATH;
		return [`${base}/**/*.md`, `${base}/**/*.mdx`, `${base}/**/${META_FILENAME}`];
	},

	parseStructure(files: DocFile[]): DocTree {
		const metaByDir = new Map<string, FumadocsMeta>();
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
			componentPatterns: ["<Callout>", "<Tabs>", "<Steps>", "<Card>"],
			linkingConventions: ["relative paths", "next/link for internal navigation"],
			fileNamingRules: ["kebab-case", "index.mdx for directory index"],
			description:
				"Fumadocs MDX. Frontmatter: title, description, icon. Components: Callout, Tabs, Steps, Card.",
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
			errors.push("Fumadocs pages require YAML frontmatter (--- ... ---)");
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
