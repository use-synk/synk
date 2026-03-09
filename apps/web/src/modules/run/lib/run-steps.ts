import z from "zod";

export const runStepDefinitions = [
	{
		key: "create-installation-octokit",
		title: "Create installation client",
		resultSchema: z.object({
			installationId: z.number().int().nonnegative(),
		}),
	},
	{
		key: "fetch-diff",
		title: "Fetch diff",
		resultSchema: z.object({
			fileCount: z.number().int().min(0),
		}),
	},
	{
		key: "filter-diff",
		title: "Filter changed files",
		resultSchema: z.object({
			fileCount: z.number().int().min(0),
		}),
	},
	{
		key: "load-synk-ai-config",
		title: "Load .synk-ai config",
		resultSchema: z.object({
			found: z.boolean(),
			ignorePathCount: z.number().int().min(0),
		}),
	},
	{
		key: "resolve-docs-config",
		title: "Resolve docs config",
		resultSchema: z.object({
			framework: z.string().nullable(),
			docsPath: z.string().nullable(),
			docsRepo: z.string().nullable(),
			docsBranch: z.string().nullable(),
			ignorePathCount: z.number().int().min(0),
		}),
	},
	{
		key: "resolve-pr-config",
		title: "Resolve PR config",
		resultSchema: z.object({
			labelsCount: z.number().int().min(0),
			assigneesCount: z.number().int().min(0),
			reviewersCount: z.number().int().min(0),
			draft: z.boolean(),
		}),
	},
	{
		key: "detect-doc-adapter",
		title: "Detect docs adapter",
		resultSchema: z.object({
			frameworkId: z.string(),
			autoDetected: z.boolean(),
		}),
	},
	{
		key: "fetch-doc-tree-and-files",
		title: "Fetch docs files",
		resultSchema: z.object({
			docFileCount: z.number().int().min(0),
			inferredDocsPath: z.string().nullable(),
		}),
	},
	{
		key: "run-ai-triage",
		title: "Run AI triage",
		resultSchema: z.object({
			needsUpdate: z.boolean(),
			affectedDocFileCount: z.number().int().min(0),
			confidence: z.number().nullable(),
			skippedByConfidence: z.boolean().nullable(),
		}),
	},
	{
		key: "run-ai-generation",
		title: "Run AI generation",
		resultSchema: z.object({
			generatedDocCount: z.number().int().min(0),
			paths: z.array(z.string()),
		}),
	},
	{
		key: "generate-suggestion-titles",
		title: "Generate suggestion titles",
		resultSchema: z.object({
			titledChangeCount: z.number().int().min(0),
			titlesGeneratedCount: z.number().int().min(0),
		}),
	},
	{
		key: "persist-suggestions",
		title: "Persist suggestions",
		resultSchema: z.object({
			persistedCount: z.number().int().min(0),
			skippedCount: z.number().int().min(0),
		}),
	},
	{
		key: "create-pr",
		title: "Create documentation PR",
		resultSchema: z.object({
			prNumber: z.number().int(),
			prUrl: z.string().url(),
			branchName: z.string(),
		}),
	},
] as const;

export type RunStepDefinition = (typeof runStepDefinitions)[number];
export type RunStepKey = RunStepDefinition["key"];

type RunStepDefinitionByKey = {
	[K in RunStepKey]: Extract<RunStepDefinition, { key: K }>;
};

export type RunStepResult<K extends RunStepKey> = z.infer<
	RunStepDefinitionByKey[K]["resultSchema"]
>;
