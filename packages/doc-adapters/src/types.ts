/**
 * Minimal representation of a file in a repository tree.
 * Compatible with GitHub tree entries (path is required for detection).
 */
export interface RepoFile {
	path: string;
	sha?: string;
	size?: number | null;
}

/**
 * Optional context for framework detection.
 * Used when the caller has fetched additional files (e.g. package.json).
 */
export interface DetectionContext {
	/** Raw content of package.json for dependency detection */
	packageJson?: string;
}

/**
 * Documentation file with content, used for structure parsing.
 */
export interface DocFile {
	path: string;
	content: string;
}

/**
 * Node in the documentation tree representing a section or page.
 */
export interface DocTreeNode {
	/** Display title (from frontmatter or heading) */
	title: string;
	/** File path relative to docs root, or empty for section-only nodes */
	path?: string;
	/** Child nodes (sections or pages) */
	children?: DocTreeNode[];
	/** Sort order within parent (lower = earlier) */
	order?: number;
}

/**
 * Hierarchical documentation structure (sections, pages, ordering).
 */
export interface DocTree {
	/** Root-level nodes */
	roots: DocTreeNode[];
}

/**
 * Framework-specific conventions for AI consumption.
 */
export interface FrameworkConventions {
	/** Frontmatter format (e.g. "yaml", "json", "none") */
	frontmatterFormat: string;
	/** Component patterns (e.g. "<Callout>", "<Tabs>") */
	componentPatterns: string[];
	/** Linking conventions (e.g. "relative paths", "next/link") */
	linkingConventions: string[];
	/** File naming rules (e.g. "kebab-case", "index.mdx") */
	fileNamingRules: string[];
	/** Additional AI-consumable description */
	description: string;
}

/**
 * Result of validating generated content.
 */
export interface ValidationResult {
	valid: boolean;
	errors?: string[];
}

/**
 * Repository-aware validation context for adapter output checks.
 */
export interface ValidationContext {
	/** Known repository file paths used for internal link validation. */
	repoFilePaths?: string[];
}

/** Known framework identifiers. Markdown is always available as fallback. */
export const FRAMEWORK_IDS = ["nextra", "fumadocs", "docusaurus", "markdown"] as const;

export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

/**
 * Docs-related configuration passed to adapters.
 * Matches the shape used in repositories.docs_config and .synk-ai.yml.
 */
export interface DocsConfig {
	/** Framework identifier */
	framework?: "auto" | FrameworkId;
	/** Path to docs within the repo (e.g. "docs/", "pages/docs") */
	path?: string;
	/** Separate docs repo (e.g. "org/docs-repo") */
	repo?: string;
	/** Target branch for doc PRs */
	branch?: string;
	/** Raw content of source.config.ts (Fumadocs only). Used to extract docs dir when path is unset. */
	sourceConfigContent?: string;
}
