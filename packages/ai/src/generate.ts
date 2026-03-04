import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject as sdkGenerateObject } from "ai";
import { z } from "zod";
import { toErrorType } from "./error-type.js";
import { type AiLogger, noopAiLogger } from "./logging.js";
import { type ModelSelectionMap, modelIdFor, resolveModelSelection } from "./models.js";
import { getErrorStatusCode } from "./retry.js";
import { estimateTokenCount } from "./token-count.js";
import { type AiTokenUsage, type UsageLike, normalizeTokenUsage, toUsageLike } from "./usage.js";

export const generationOutputSchema = z.object({
	updatedContent: z.string(),
	changeDescription: z.string(),
});

export type GenerationOutput = z.infer<typeof generationOutputSchema>;

export type DocFile = {
	path: string;
	content: string;
};

export type DocGenerationRequest = {
	diff: string;
	docFile: DocFile;
	frameworkConventions?: string;
	customInstructions?: string;
};

export type ValidationResult = {
	valid: boolean;
	errors?: string[];
};

export type ValidateOutputFn = (content: string, filePath: string) => ValidationResult;

export type DocGenerationResult = {
	filePath: string;
	updatedContent: string;
	changeDescription: string;
	tokenUsage: AiTokenUsage;
	skipped: boolean;
};

export class DocGenerationValidationError extends Error {
	public readonly filePath: string;
	public readonly validationErrors: string[];

	public constructor(filePath: string, validationErrors?: string[]) {
		const normalizedErrors = validationErrors?.filter((error) => error.trim().length > 0) ?? [];
		const details =
			normalizedErrors.length > 0
				? ` Validation errors: ${normalizedErrors.join("; ")}`
				: "";
		super(`Generated documentation failed validation for ${filePath}.${details}`);
		this.name = "DocGenerationValidationError";
		this.filePath = filePath;
		this.validationErrors = normalizedErrors;
	}
}

type GenerateObjectArguments = Parameters<typeof sdkGenerateObject>[0];
type GenerateObjectModel = GenerateObjectArguments["model"];

type GenerateObjectInput = {
	model: GenerateObjectModel;
	schema: typeof generationOutputSchema;
	system: string;
	prompt: string;
};

type GenerateObjectOutcome = {
	object: GenerationOutput;
	usage: UsageLike | undefined;
};

type GenerateObjectFn = (input: GenerateObjectInput) => Promise<GenerateObjectOutcome>;
type ProviderFactory = (options: { apiKey: string }) => (modelId: string) => GenerateObjectModel;

export type DocGenerationOptions = {
	apiKey: string;
	models?: Partial<ModelSelectionMap>;
	logger?: AiLogger;
	providerFactory?: ProviderFactory;
	generateObjectFn?: GenerateObjectFn;
	validateOutput?: ValidateOutputFn;
};

export type DocGeneration = {
	generate: (request: DocGenerationRequest) => Promise<DocGenerationResult>;
};

const GENERATION_SYSTEM_PROMPT = `You are a documentation writer for a software project. Update existing documentation to reflect code changes.

Guidelines:
- Make minimal, targeted changes to the documentation
- Preserve the existing style, tone, and formatting exactly
- Only update sections affected by the code change
- Do not add new unrelated sections or content
- Do not remove existing content unless it is explicitly invalidated by the change
- Keep structural elements (headings, lists, code blocks) in the same format

Respond with the complete updated document content and a brief description of what changed.`;

const buildUserPrompt = (request: DocGenerationRequest): string => {
	const sections: string[] = [
		"Update the following documentation file to reflect the code change.",
		"",
		"## Current Documentation Content",
		"<document>",
		request.docFile.content,
		"</document>",
		"",
		"## Code Diff",
		"<diff>",
		request.diff,
		"</diff>",
	];

	if (request.frameworkConventions) {
		sections.push("", "## Framework Conventions", request.frameworkConventions);
	}

	if (request.customInstructions) {
		sections.push("", "## Custom Instructions", request.customInstructions);
	}

	sections.push(
		"",
		"Provide:",
		"1. The complete updated documentation content (updatedContent) — return the full file, not just changed sections",
		"2. A brief description of what you changed (changeDescription) — use an empty string if no changes were needed",
	);

	return sections.join("\n");
};

const normalizeContent = (content: string): string =>
	content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const hasMeaningfulDiff = (original: string, updated: string): boolean =>
	normalizeContent(original).trim() !== normalizeContent(updated).trim();

const postProcess = (content: string): string => {
	const normalized = normalizeContent(content);
	return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
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

export const createDocGeneration = (options: DocGenerationOptions): DocGeneration => {
	const providerFactory: ProviderFactory = options.providerFactory ?? createOpenRouter;
	const logger = options.logger ?? noopAiLogger;
	const modelSelection = resolveModelSelection(options.models);
	const generateObjectFn = options.generateObjectFn ?? runGenerateObject;
	const openRouterProvider = providerFactory({ apiKey: options.apiKey });

	return {
		generate: async (request: DocGenerationRequest): Promise<DocGenerationResult> => {
			if (!request.diff.trim()) {
				throw new TypeError("diff must not be empty.");
			}
			if (!request.docFile.content.trim()) {
				throw new TypeError("docFile.content must not be empty.");
			}

			const modelId = modelIdFor("generate", modelSelection);
			const prompt = buildUserPrompt(request);
			const contextTokenEstimate = estimateTokenCount(GENERATION_SYSTEM_PROMPT + prompt);

			logger.info("ai.generate.request", {
				modelId,
				filePath: request.docFile.path,
				diffLength: request.diff.length,
				contentLength: request.docFile.content.length,
				contextTokenEstimate,
			});

			try {
				const result = await generateObjectFn({
					model: openRouterProvider(modelId),
					schema: generationOutputSchema,
					system: GENERATION_SYSTEM_PROMPT,
					prompt,
				});

				const tokenUsage = normalizeTokenUsage(result.usage, contextTokenEstimate);
				const processedContent = postProcess(result.object.updatedContent);
				const skipped = !hasMeaningfulDiff(request.docFile.content, processedContent);

				if (!skipped && options.validateOutput) {
					const validation = options.validateOutput(processedContent, request.docFile.path);
					if (!validation.valid) {
						logger.warn("ai.generate.validation_failed", {
							filePath: request.docFile.path,
							errorCount: validation.errors?.length ?? 0,
						});
						throw new DocGenerationValidationError(request.docFile.path, validation.errors);
					}
				}

				logger.info("ai.generate.response", {
					modelId,
					filePath: request.docFile.path,
					skipped,
					tokenUsage,
				});

				return {
					filePath: request.docFile.path,
					updatedContent: processedContent,
					changeDescription: result.object.changeDescription,
					tokenUsage,
					skipped,
				};
			} catch (error) {
				logger.error("ai.generate.error", {
					modelId,
					filePath: request.docFile.path,
					statusCode: getErrorStatusCode(error),
					errorType: toErrorType(error),
				});
				throw error;
			}
		},
	};
};
