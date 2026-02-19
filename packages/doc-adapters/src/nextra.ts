import type { DocAdapter } from "./adapter.js";
import {
	addHeadingChildren,
	extractFrontmatter,
	extractHeadings,
	extractMarkdownLinks,
	hasUnclosedCodeFence,
	isBrokenLink,
	pathToTitle,
	slugifyHeading,
	toPathSet,
} from "./shared.js";
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
		(f) =>
			(f.path.startsWith("pages/docs/") || f.path.startsWith("content/")) && isMetaFilePath(f.path),
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
	return value.display === "hidden";
};

const isExternalMetaLink = (value: MetaValue): boolean =>
	typeof value === "object" && value !== null && "href" in value;

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
		if (value !== undefined && isExternalMetaLink(value)) {
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

export { slugifyHeading };
