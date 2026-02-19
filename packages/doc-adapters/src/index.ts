export type { DocAdapter } from "./adapter.js";
export { fumadocsAdapter } from "./fumadocs.js";
export { markdownAdapter } from "./markdown.js";
export { nextraAdapter } from "./nextra.js";
export {
	detectAdapter,
	detectFramework,
	getAdapter,
	FRAMEWORK_IDS,
	type FrameworkId,
} from "./registry.js";
export type {
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
