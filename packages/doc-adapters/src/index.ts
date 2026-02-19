export type { DocAdapter } from "./adapter.js";
export { markdownAdapter } from "./markdown.js";
export { detectAdapter, getAdapter, FRAMEWORK_IDS, type FrameworkId } from "./registry.js";
export type {
	DocFile,
	DocTree,
	DocTreeNode,
	DocsConfig,
	FrameworkConventions,
	RepoFile,
	ValidationContext,
	ValidationResult,
} from "./types.js";
