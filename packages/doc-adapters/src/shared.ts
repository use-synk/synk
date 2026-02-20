/**
 * Shared parsing and validation utilities used by all doc adapters.
 * Not part of the public API — import from the adapter files or the barrel.
 */
import type { DocTreeNode, ValidationContext } from "./types";

export type MarkdownHeading = {
	level: number;
	title: string;
};

export const pathToTitle = (path: string): string => {
	const baseName = path.split("/").pop() ?? path;
	return baseName.replace(/\.(md|mdx)$/i, "").replace(/-/g, " ");
};

export const updateCodeFenceState = (
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

export const hasUnclosedCodeFence = (content: string): boolean => {
	let activeFence: string | undefined;
	for (const line of content.split("\n")) {
		activeFence = updateCodeFenceState(activeFence, line);
	}
	return activeFence !== undefined;
};

/**
 * Converts a heading title to a URL-safe anchor slug.
 * Collapses repeated hyphens and strips leading/trailing hyphens to match
 * standard framework anchor generation behaviour.
 */
export const slugifyHeading = (title: string): string =>
	title
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");

export const extractHeadings = (content: string): MarkdownHeading[] => {
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

export const getHeadingParent = (
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

export const addHeadingChildren = (
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

/**
 * Extracts markdown link targets from content.
 * Skips links inside fenced code blocks and image references (![alt](url)).
 */
export const extractMarkdownLinks = (content: string): string[] => {
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
			// Skip image references (e.g. ![alt](url))
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

/**
 * Extracts frontmatter fields from a YAML frontmatter block.
 * Returns null if no frontmatter block is present.
 */
export const extractFrontmatter = (
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

export const isExternalLinkHref = (href: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(href);

export const normalizePath = (path: string): string | undefined => {
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

export const resolveLinkPath = (href: string, filePath: string): string | undefined => {
	const target = href.split(/[?#]/, 1)[0]?.trim() ?? "";
	if (target.length === 0) return "";
	const dir = filePath.split("/").slice(0, -1).filter(Boolean).join("/");
	const combined = dir ? `${dir}/${target}` : target;
	return target.startsWith("/") ? normalizePath(target.slice(1)) : normalizePath(combined);
};

export const toPathSet = (ctx?: ValidationContext): Set<string> => {
	const paths = ctx?.repoFilePaths ?? [];
	return new Set(paths.map((p) => normalizePath(p)).filter((p): p is string => p !== undefined));
};

export const getLinkCandidates = (resolved: string): string[] => {
	if (/\.(md|mdx)$/i.test(resolved)) return [resolved];
	return [
		resolved,
		`${resolved}.md`,
		`${resolved}.mdx`,
		`${resolved}/index.md`,
		`${resolved}/index.mdx`,
	];
};

/**
 * Returns true when a link href is broken relative to the current file and
 * the known repository paths.
 */
export const isBrokenLink = (href: string, filePath: string, known: Set<string>): boolean => {
	if (href.startsWith("#") || isExternalLinkHref(href)) return false;
	const resolved = resolveLinkPath(href, filePath);
	if (resolved === undefined) return true;
	if (resolved === "") return false;
	if (known.size === 0) return false;
	return !getLinkCandidates(resolved).some((c) => known.has(c));
};
