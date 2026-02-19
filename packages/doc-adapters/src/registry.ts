import type { DocAdapter } from "./adapter.js";
import { fumadocsAdapter } from "./fumadocs.js";
import { markdownAdapter } from "./markdown.js";
import { nextraAdapter } from "./nextra.js";
import type { DetectionContext, RepoFile } from "./types.js";
import { FRAMEWORK_IDS, type FrameworkId } from "./types.js";

export { FRAMEWORK_IDS, type FrameworkId };

const createPendingAdapter = (frameworkId: Exclude<FrameworkId, "markdown">): DocAdapter => ({
	frameworkId,

	async detect(_tree: RepoFile[], _context?: DetectionContext): Promise<boolean> {
		return false;
	},

	getDocPaths(config) {
		return markdownAdapter.getDocPaths(config);
	},

	parseStructure(files) {
		return markdownAdapter.parseStructure(files);
	},

	getConventions() {
		const conventions = markdownAdapter.getConventions();
		return {
			...conventions,
			description: `${frameworkId} adapter is not implemented yet; using markdown fallback conventions.`,
		};
	},

	validateOutput(content, filePath, context) {
		return markdownAdapter.validateOutput(content, filePath, context);
	},
});

/** Adapters in detection priority order (highest first). Markdown is last as fallback. */
const ADAPTERS_BY_PRIORITY: DocAdapter[] = [
	nextraAdapter,
	fumadocsAdapter,
	createPendingAdapter("docusaurus"),
	markdownAdapter,
];

const ADAPTERS_BY_ID = new Map<string, DocAdapter>(
	ADAPTERS_BY_PRIORITY.map((a) => [a.frameworkId, a]),
);

/**
 * Returns the adapter for the given framework identifier.
 * @throws if framework is unknown
 */
export function getAdapter(framework: string): DocAdapter {
	const adapter = ADAPTERS_BY_ID.get(framework);
	if (adapter === undefined) {
		throw new Error(`Unknown doc framework: ${framework}`);
	}
	return adapter;
}

/**
 * Runs adapters in priority order and returns the first that detects the repo.
 * Falls back to plain markdown if no framework-specific adapter matches.
 * @param context - Optional context (e.g. package.json) for dependency-based detection
 */
export async function detectAdapter(
	tree: RepoFile[],
	context?: DetectionContext,
): Promise<DocAdapter> {
	for (const adapter of ADAPTERS_BY_PRIORITY) {
		const detected = await adapter.detect(tree, context);
		if (detected) {
			return adapter;
		}
	}
	return markdownAdapter;
}

/**
 * Runs all adapters and returns the best match for the given repository tree.
 * Convenience wrapper for detectAdapter with explicit packageJson parameter.
 * @param tree - Repository file tree (paths, shas)
 * @param packageJson - Raw package.json content for dependency-based detection
 */
export async function detectFramework(tree: RepoFile[], packageJson?: string): Promise<DocAdapter> {
	return detectAdapter(tree, packageJson ? { packageJson } : undefined);
}
