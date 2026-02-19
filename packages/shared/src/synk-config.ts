import { parse as parseYaml } from "yaml";
import { z } from "zod";

const FRAMEWORK_VALUES = ["auto", "nextra", "fumadocs", "docusaurus", "markdown"] as const;
const frameworkSchema = z
	.string()
	.optional()
	.transform((v): (typeof FRAMEWORK_VALUES)[number] | undefined =>
		v && FRAMEWORK_VALUES.includes(v as (typeof FRAMEWORK_VALUES)[number])
			? (v as (typeof FRAMEWORK_VALUES)[number])
			: undefined,
	);

const docsSectionSchema = z
	.object({
		framework: frameworkSchema.optional(),
		path: z.string().min(1).optional(),
		repo: z.string().min(1).optional(),
		branch: z.string().min(1).optional(),
	})
	.strict();

const defaultDocs = (): z.infer<typeof docsSectionSchema> => ({});
const defaultTriggers = (): z.infer<typeof triggersSectionSchema> => ({
	branches: ["main"],
	ignore_paths: [],
});
const defaultAi = (): z.infer<typeof aiSectionSchema> => ({
	model: "auto",
	custom_instructions: "",
	triage_confidence_threshold: 0.7,
	token_budget: 80_000,
});
const defaultPr = (): z.infer<typeof prSectionSchema> => ({
	labels: ["documentation", "synk-ai"],
	draft: false,
	assignees: [],
	reviewers: [],
});

const triggersSectionSchema = z
	.object({
		branches: z.array(z.string()).optional().default(["main"]),
		ignore_paths: z.array(z.string()).optional().default([]),
	})
	.strict();

const aiSectionSchema = z
	.object({
		model: z.string().optional().default("auto"),
		custom_instructions: z.string().optional().default(""),
		triage_confidence_threshold: z.number().min(0).max(1).optional().default(0.7),
		token_budget: z.number().int().positive().optional().default(80_000),
	})
	.strict();

const prSectionSchema = z
	.object({
		labels: z.array(z.string()).optional().default(["documentation", "synk-ai"]),
		draft: z.boolean().optional().default(false),
		assignees: z.array(z.string()).optional().default([]),
		reviewers: z.array(z.string()).optional().default([]),
	})
	.strict();

export const synkAiConfigSchema = z
	.object({
		docs: docsSectionSchema.optional().default(defaultDocs),
		triggers: triggersSectionSchema.optional().default(defaultTriggers),
		ai: aiSectionSchema.optional().default(defaultAi),
		pr: prSectionSchema.optional().default(defaultPr),
	})
	.strict();

export type SynkAiConfig = z.infer<typeof synkAiConfigSchema>;

export type ParsedSynkAiConfig = {
	docs: {
		framework?: "auto" | "nextra" | "fumadocs" | "docusaurus" | "markdown";
		path?: string;
		repo?: string;
		branch?: string;
	};
	ignorePaths: string[];
	triggers: SynkAiConfig["triggers"];
	ai: SynkAiConfig["ai"];
	pr: SynkAiConfig["pr"];
};

/**
 * Parses .synk-ai.yml content using Zod schema with sensible defaults.
 * Returns null for empty content or parse failure.
 */
export function parseSynkAiConfigFromYaml(content: string): ParsedSynkAiConfig | null {
	const trimmed = content.trim();
	if (trimmed.length === 0) {
		return {
			docs: {},
			ignorePaths: [],
			triggers: { branches: ["main"], ignore_paths: [] },
			ai: {
				model: "auto",
				custom_instructions: "",
				triage_confidence_threshold: 0.7,
				token_budget: 80_000,
			},
			pr: {
				labels: ["documentation", "synk-ai"],
				draft: false,
				assignees: [],
				reviewers: [],
			},
		};
	}

	// Normalize tabs to spaces (YAML spec disallows tabs; some configs use them)
	const normalized = trimmed.replace(/\t/gu, "  ");
	let raw: unknown;
	try {
		raw = parseYaml(normalized, { strict: true });
	} catch {
		return null;
	}

	if (raw === null || raw === undefined) {
		return {
			docs: {},
			ignorePaths: [],
			triggers: { branches: ["main"], ignore_paths: [] },
			ai: {
				model: "auto",
				custom_instructions: "",
				triage_confidence_threshold: 0.7,
				token_budget: 80_000,
			},
			pr: {
				labels: ["documentation", "synk-ai"],
				draft: false,
				assignees: [],
				reviewers: [],
			},
		};
	}

	const result = synkAiConfigSchema.safeParse(raw);
	if (!result.success) {
		return null;
	}

	const config = result.data;
	const docs = config.docs ?? {};
	const triggers = config.triggers ?? { branches: ["main"], ignore_paths: [] };
	const ignorePaths = triggers.ignore_paths ?? [];

	const docsOut: ParsedSynkAiConfig["docs"] = {};
	if (docs.framework !== undefined) docsOut.framework = docs.framework;
	if (docs.path !== undefined) docsOut.path = docs.path;
	if (docs.repo !== undefined) docsOut.repo = docs.repo;
	if (docs.branch !== undefined) docsOut.branch = docs.branch;

	return {
		docs: docsOut,
		ignorePaths,
		triggers,
		ai: config.ai ?? defaultAi(),
		pr: config.pr ?? defaultPr(),
	};
}
