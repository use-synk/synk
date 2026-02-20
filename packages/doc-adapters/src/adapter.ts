import type {
	DetectionContext,
	DocFile,
	DocTree,
	DocsConfig,
	FrameworkConventions,
	RepoFile,
	ValidationContext,
	ValidationResult,
} from "./types";

/**
 * Adapter contract for documentation frameworks.
 * Each framework (Nextra, Fumadocs, Markdown, etc.) implements this interface.
 */
export interface DocAdapter {
	/** Unique framework identifier (e.g. "nextra", "markdown") */
	readonly frameworkId: string;

	/**
	 * Returns true if this framework is detected in the repository tree.
	 * @param context - Optional context (e.g. package.json) for dependency-based detection
	 */
	detect(tree: RepoFile[], context?: DetectionContext): Promise<boolean>;

	/**
	 * Returns glob patterns for documentation source files.
	 */
	getDocPaths(config: DocsConfig): string[];

	/**
	 * Parses doc files into a hierarchical structure (sections, pages, ordering).
	 */
	parseStructure(files: DocFile[]): DocTree;

	/**
	 * Returns framework-specific conventions for AI consumption.
	 */
	getConventions(): FrameworkConventions;

	/**
	 * Validates generated content against framework rules.
	 */
	validateOutput(content: string, filePath: string, context?: ValidationContext): ValidationResult;
}
