export type { DocAdapter } from "./adapter";
export { fumadocsAdapter } from "./fumadocs";
export { markdownAdapter } from "./markdown";
export { nextraAdapter } from "./nextra";
export {
	detectAdapter,
	detectFramework,
	getAdapter,
	FRAMEWORK_IDS,
	type FrameworkId,
} from "./registry";
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
} from "./types";
