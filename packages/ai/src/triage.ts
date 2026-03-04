import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject as sdkGenerateObject } from "ai";
import { z } from "zod";
import { toErrorType } from "./error-type.js";
import { type AiLogger, noopAiLogger } from "./logging.js";
import { type ModelSelectionMap, modelIdFor, resolveModelSelection } from "./models.js";
import { getErrorStatusCode } from "./retry.js";
import { estimateTokenCount } from "./token-count.js";
import { type AiTokenUsage, type UsageLike, normalizeTokenUsage, toUsageLike } from "./usage.js";

export const triageOutputSchema = z.object({
	needsUpdate: z.boolean(),
	confidence: z.number().min(0).max(1),
	affectedDocFiles: z.array(z.string()),
	reasoning: z.string(),
});

export type TriageOutput = z.infer<typeof triageOutputSchema>;

export type DocTriageRequest = {
	diff: string;
	docFileTree: string[];
	frameworkConventions?: string;
	customInstructions?: string;
};

export type DocTriageResult = {
	output: TriageOutput;
	tokenUsage: AiTokenUsage;
	skipped: boolean;
};

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

type GenerateObjectArguments = Parameters<typeof sdkGenerateObject>[0];
type GenerateObjectModel = GenerateObjectArguments["model"];

type GenerateObjectInput = {
	model: GenerateObjectModel;
	schema: typeof triageOutputSchema;
	system: string;
	prompt: string;
};

type GenerateObjectOutcome = {
	object: TriageOutput;
	usage: UsageLike | undefined;
};

type GenerateObjectFn = (input: GenerateObjectInput) => Promise<GenerateObjectOutcome>;
type ProviderFactory = (options: { apiKey: string }) => (modelId: string) => GenerateObjectModel;

export type DocTriageOptions = {
	apiKey: string;
	confidenceThreshold?: number;
	models?: Partial<ModelSelectionMap>;
	logger?: AiLogger;
	providerFactory?: ProviderFactory;
	generateObjectFn?: GenerateObjectFn;
};

export type DocTriage = {
	triage: (request: DocTriageRequest) => Promise<DocTriageResult>;
};

const TRIAGE_SYSTEM_PROMPT = `You are a documentation reviewer for a software project. Analyze code changes and determine whether they require documentation updates.

Review the provided code diff and identify:
- New public APIs, features, configuration options, or behaviors that need documentation
- Changes or removals of existing documented behavior
- Which specific documentation files are affected

Guidelines:
- Be conservative: only flag changes that clearly require documentation updates
- Internal refactors, performance improvements, and test-only changes rarely need documentation updates
- Focus on user-facing changes: public APIs, CLI options, configuration, behavior

Respond with a structured JSON object matching the required schema.`;

const buildUserPrompt = (request: DocTriageRequest): string => {
	const sections: string[] = [
		"Analyze the following code change and determine whether the project documentation requires updates.",
		"",
		"## Code Diff",
		request.diff,
		"",
		"## Documentation File Tree",
		request.docFileTree.map((f) => `- ${f}`).join("\n"),
	];

	if (request.frameworkConventions) {
		sections.push("", "## Framework Conventions", request.frameworkConventions);
	}

	if (request.customInstructions) {
		sections.push("", "## Custom Instructions", request.customInstructions);
	}

	sections.push(
		"",
		"Identify:",
		"1. Whether any documentation needs updating (needsUpdate: true/false)",
		"2. Your confidence level from 0.0 (uncertain) to 1.0 (certain)",
		"3. Which documentation files require updates (exact paths from the file tree; empty array if none)",
		"4. Brief reasoning for your decision",
	);

	return sections.join("\n");
};

const runGenerateObject: GenerateObjectFn = async (input) => {
	const result = await sdkGenerateObject({
		model: input.model,
		schema: input.schema,
		system: input.system,
		prompt: input.prompt,
	});

	return {
		object: result.object,
		usage: toUsageLike(result.usage),
	};
};

export const createDocTriage = (options: DocTriageOptions): DocTriage => {
	const confidenceThreshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

	if (confidenceThreshold < 0 || confidenceThreshold > 1) {
		throw new RangeError("confidenceThreshold must be between 0 and 1.");
	}

	const providerFactory: ProviderFactory = options.providerFactory ?? createOpenRouter;
	const logger = options.logger ?? noopAiLogger;
	const modelSelection = resolveModelSelection(options.models);
	const generateObjectFn = options.generateObjectFn ?? runGenerateObject;
	const openRouterProvider = providerFactory({ apiKey: options.apiKey });

	return {
		triage: async (request: DocTriageRequest): Promise<DocTriageResult> => {
			const modelId = modelIdFor("triage", modelSelection);
			const prompt = buildUserPrompt(request);
			const contextTokenEstimate = estimateTokenCount(TRIAGE_SYSTEM_PROMPT + prompt);

			logger.info("ai.triage.request", {
				modelId,
				diffLength: request.diff.length,
				docFileCount: request.docFileTree.length,
				contextTokenEstimate,
			});

			try {
				const result = await generateObjectFn({
					model: openRouterProvider(modelId),
					schema: triageOutputSchema,
					system: TRIAGE_SYSTEM_PROMPT,
					prompt,
				});

				const tokenUsage = normalizeTokenUsage(result.usage, contextTokenEstimate);
				const skipped = result.object.confidence < confidenceThreshold;

				logger.info("ai.triage.response", {
					modelId,
					needsUpdate: result.object.needsUpdate,
					confidence: result.object.confidence,
					skipped,
					tokenUsage,
				});

				return {
					output: result.object,
					tokenUsage,
					skipped,
				};
			} catch (error) {
				logger.error("ai.triage.error", {
					modelId,
					statusCode: getErrorStatusCode(error),
					errorType: toErrorType(error),
				});
				throw error;
			}
		},
	};
};
