import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModelUsage, generateText as sdkGenerateText } from "ai";
import { parseOpenRouterEnvironment } from "./env.js";
import { type AiLogger, noopAiLogger } from "./logging.js";
import {
	type LogicalModelName,
	type ModelSelectionMap,
	modelIdFor,
	resolveModelSelection,
} from "./models.js";
import {
	DEFAULT_RETRY_OPTIONS,
	type RetryOptions,
	getErrorStatusCode,
	withExponentialBackoff,
} from "./retry.js";
import { estimateTokenCount } from "./token-count.js";

export type AiTokenUsage = {
	prompt: number;
	completion: number;
	total: number;
};

export type AiTextGenerationRequest = {
	purpose: LogicalModelName;
	prompt: string;
	maxRetries?: number;
	metadata?: Record<string, string | number | boolean>;
};

export type AiTextGenerationResponse = {
	text: string;
	modelId: string;
	tokenUsage: AiTokenUsage;
	finishReason: string | undefined;
};

type RequiredRetryOptions = Omit<RetryOptions, "sleep"> & {
	sleep?: RetryOptions["sleep"];
};

type GenerateTextArguments = Parameters<typeof sdkGenerateText>[0];
type GenerateTextModel = GenerateTextArguments["model"];

type UsageLike = {
	inputTokens?: number | undefined;
	outputTokens?: number | undefined;
	totalTokens?: number | undefined;
	promptTokens?: number | undefined;
	completionTokens?: number | undefined;
};

type GenerateTextCall = {
	model: GenerateTextModel;
	prompt: string;
};

type GenerateTextOutcome = {
	text: string;
	usage: UsageLike | undefined;
	finishReason: string | undefined;
};

type GenerateTextFunction = (input: GenerateTextCall) => Promise<GenerateTextOutcome>;
type ProviderFactory = (options: { apiKey: string }) => (modelId: string) => GenerateTextModel;

export type AiClientOptions = {
	apiKey: string;
	models?: Partial<ModelSelectionMap>;
	logger?: AiLogger;
	retry?: Partial<RequiredRetryOptions>;
	providerFactory?: ProviderFactory;
	generateTextFn?: GenerateTextFunction;
};

export type AiClient = {
	generateText: (request: AiTextGenerationRequest) => Promise<AiTextGenerationResponse>;
};

const toUsageLike = (usage: LanguageModelUsage | undefined): UsageLike | undefined => usage;

const runGenerateText: GenerateTextFunction = async (
	input: GenerateTextCall,
): Promise<GenerateTextOutcome> => {
	const result = await sdkGenerateText({
		model: input.model,
		prompt: input.prompt,
	});

	return {
		text: result.text,
		usage: toUsageLike(result.usage),
		finishReason: typeof result.finishReason === "string" ? result.finishReason : undefined,
	};
};

const normalizeTokenUsage = (usage: UsageLike | undefined, estimate: number): AiTokenUsage => {
	const prompt = usage?.inputTokens ?? usage?.promptTokens ?? estimate;
	const completion = usage?.outputTokens ?? usage?.completionTokens ?? 0;
	const total = usage?.totalTokens ?? prompt + completion;
	return { prompt, completion, total };
};

const createRetryOptions = (
	overrides: Partial<RequiredRetryOptions> | undefined,
): RetryOptions => ({
	maxAttempts: overrides?.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts,
	initialDelayMs: overrides?.initialDelayMs ?? DEFAULT_RETRY_OPTIONS.initialDelayMs,
	maxDelayMs: overrides?.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs,
	backoffMultiplier: overrides?.backoffMultiplier ?? DEFAULT_RETRY_OPTIONS.backoffMultiplier,
	sleep: overrides?.sleep ?? DEFAULT_RETRY_OPTIONS.sleep,
});

export const createAiClient = (options: AiClientOptions): AiClient => {
	const providerFactory: ProviderFactory = options.providerFactory ?? createOpenRouter;
	const logger = options.logger ?? noopAiLogger;
	const modelSelection = resolveModelSelection(options.models);
	const retryOptions = createRetryOptions(options.retry);
	const openRouterProvider = providerFactory({ apiKey: options.apiKey });
	const generateTextFn = options.generateTextFn ?? runGenerateText;

	return {
		generateText: async (request: AiTextGenerationRequest): Promise<AiTextGenerationResponse> => {
			const modelId = modelIdFor(request.purpose, modelSelection);
			const promptTokenEstimate = estimateTokenCount(request.prompt);
			const maxAttempts =
				request.maxRetries !== undefined
					? Math.max(1, request.maxRetries + 1)
					: retryOptions.maxAttempts;
			const retryConfig: RetryOptions = {
				...retryOptions,
				maxAttempts,
			};
			const startedAt = Date.now();

			logger.info("ai.request", {
				purpose: request.purpose,
				modelId,
				promptLength: request.prompt.length,
				promptTokenEstimate,
				maxAttempts,
				metadata: request.metadata ?? {},
			});

			try {
				const result = await withExponentialBackoff(
					() =>
						generateTextFn({
							model: openRouterProvider(modelId),
							prompt: request.prompt,
						}),
					retryConfig,
					(event) => {
						logger.warn("ai.retry", {
							purpose: request.purpose,
							modelId,
							attempt: event.attempt,
							maxAttempts: event.maxAttempts,
							delayMs: event.delayMs,
							statusCode: getErrorStatusCode(event.error),
							message: event.error instanceof Error ? event.error.message : "Unknown error",
						});
					},
				);

				const tokenUsage = normalizeTokenUsage(result.usage, promptTokenEstimate);
				const durationMs = Date.now() - startedAt;

				logger.info("ai.response", {
					purpose: request.purpose,
					modelId,
					durationMs,
					finishReason: result.finishReason,
					tokenUsage,
				});

				return {
					text: result.text,
					modelId,
					tokenUsage,
					finishReason: result.finishReason,
				};
			} catch (error) {
				logger.error("ai.error", {
					purpose: request.purpose,
					modelId,
					statusCode: getErrorStatusCode(error),
					message: error instanceof Error ? error.message : "Unknown error",
				});
				throw error;
			}
		},
	};
};

export const createAiClientFromEnvironment = (
	options: Omit<AiClientOptions, "apiKey"> = {},
): AiClient => {
	const env = parseOpenRouterEnvironment();
	return createAiClient({
		...options,
		apiKey: env.OPENROUTER_API_KEY,
	});
};
