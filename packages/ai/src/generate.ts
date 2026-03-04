import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject as sdkGenerateObject } from "ai";
import { z } from "zod";
import { toErrorType } from "./error-type.js";
import { type AiLogger, noopAiLogger } from "./logging.js";
import { type ModelSelectionMap, modelIdFor, resolveModelSelection } from "./models.js";
import {
	VERSION as GENERATION_PROMPT_VERSION,
	buildGenerationPrompt,
} from "./prompts/generation.js";
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
			normalizedErrors.length > 0 ? ` Validation errors: ${normalizedErrors.join("; ")}` : "";
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
			const messages = buildGenerationPrompt({
				diff: request.diff,
				docFilePath: request.docFile.path,
				docFileContent: request.docFile.content,
				frameworkConventions: request.frameworkConventions,
				customInstructions: request.customInstructions,
			});
			const [systemMessage, userMessage] = messages;
			const contextTokenEstimate = estimateTokenCount(
				`${systemMessage.content}\n\n${userMessage.content}`,
			);

			logger.info("ai.generate.request", {
				modelId,
				promptVersion: GENERATION_PROMPT_VERSION,
				filePath: request.docFile.path,
				diffLength: request.diff.length,
				contentLength: request.docFile.content.length,
				contextTokenEstimate,
			});

			try {
				const result = await generateObjectFn({
					model: openRouterProvider(modelId),
					schema: generationOutputSchema,
					system: systemMessage.content,
					prompt: userMessage.content,
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
					promptVersion: GENERATION_PROMPT_VERSION,
					filePath: request.docFile.path,
					statusCode: getErrorStatusCode(error),
					errorType: toErrorType(error),
				});
				throw error;
			}
		},
	};
};
