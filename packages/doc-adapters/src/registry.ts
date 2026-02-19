import type { DocAdapter } from "./adapter.js";
import { markdownAdapter } from "./markdown.js";
import type { RepoFile } from "./types.js";

/** Known framework identifiers. Markdown is always available as fallback. */
export const FRAMEWORK_IDS = ["nextra", "fumadocs", "docusaurus", "markdown"] as const;

export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

/** Adapters in detection priority order (highest first). Markdown is last as fallback. */
const ADAPTERS_BY_PRIORITY: DocAdapter[] = [
	// nextra, fumadocs, docusaurus will be added in 3.3, 3.4
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
 */
export async function detectAdapter(tree: RepoFile[]): Promise<DocAdapter> {
	for (const adapter of ADAPTERS_BY_PRIORITY) {
		const detected = await adapter.detect(tree);
		if (detected) {
			return adapter;
		}
	}
	return markdownAdapter;
}
