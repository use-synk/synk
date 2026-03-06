import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText as sdkGenerateText } from "ai";
import { toErrorType } from "./error-type.js";
import { type AiLogger, noopAiLogger } from "./logging.js";
import { type ModelSelectionMap, modelIdFor, resolveModelSelection } from "./models.js";
import { VERSION as TITLE_PROMPT_VERSION, buildTitlePrompt } from "./prompts/title.js";
import { getErrorStatusCode } from "./retry.js";
import { estimateTokenCount } from "./token-count.js";
import { type AiTokenUsage, type UsageLike, normalizeTokenUsage, toUsageLike } from "./usage.js";

const MAX_TITLE_LENGTH = 80;
const EXCERPT_MAX_CHARS = 600;

export type SuggestionTitleRequest = {
	docPath: string;
	reasoning: string | undefined;
	beforeContent: string;
	afterContent: string;
};

export type SuggestionTitleResult = {
	title: string;
	tokenUsage: AiTokenUsage;
};

type GenerateTextArguments = Parameters<typeof sdkGenerateText>[0];
type GenerateTextModel = GenerateTextArguments["model"];

type GenerateTextInput = {
	model: GenerateTextModel;
	system: string;
	prompt: string;
};

type GenerateTextOutcome = {
	text: string;
	usage: UsageLike | undefined;
};

type GenerateTextFn = (input: GenerateTextInput) => Promise<GenerateTextOutcome>;
type ProviderFactory = (options: { apiKey: string }) => (modelId: string) => GenerateTextModel;

export type SuggestionTitleOptions = {
	apiKey: string;
	models?: Partial<ModelSelectionMap>;
	logger?: AiLogger;
	providerFactory?: ProviderFactory;
	generateTextFn?: GenerateTextFn;
};

export type SuggestionTitle = {
	generate: (request: SuggestionTitleRequest) => Promise<SuggestionTitleResult>;
};

const runGenerateText: GenerateTextFn = async (input) => {
	const result = await sdkGenerateText({
		model: input.model,
		system: input.system,
		prompt: input.prompt,
	});

	return {
		text: result.text,
		usage: toUsageLike(result.usage),
	};
};

const truncateExcerpt = (content: string): string =>
	content.length <= EXCERPT_MAX_CHARS ? content : `${content.slice(0, EXCERPT_MAX_CHARS)}…`;

const normalizeTitle = (raw: string): string => {
	const trimmed = raw.trim().replace(/^["']|["']$/g, "").trimEnd().replace(/[.!]$/u, "");
	return trimmed.slice(0, MAX_TITLE_LENGTH);
};

export const createSuggestionTitle = (options: SuggestionTitleOptions): SuggestionTitle => {
	const providerFactory: ProviderFactory = options.providerFactory ?? createOpenRouter;
	const logger = options.logger ?? noopAiLogger;
	const modelSelection = resolveModelSelection(options.models);
	const generateTextFn = options.generateTextFn ?? runGenerateText;
	const openRouterProvider = providerFactory({ apiKey: options.apiKey });

	return {
		generate: async (request: SuggestionTitleRequest): Promise<SuggestionTitleResult> => {
			const modelId = modelIdFor("title", modelSelection);
			const messages = buildTitlePrompt({
				docPath: request.docPath,
				reasoning: request.reasoning,
				beforeExcerpt: truncateExcerpt(request.beforeContent),
				afterExcerpt: truncateExcerpt(request.afterContent),
			});
			const [systemMessage, userMessage] = messages;
			const contextTokenEstimate = estimateTokenCount(
				`${systemMessage.content}\n\n${userMessage.content}`,
			);

			logger.info("ai.title.request", {
				modelId,
				promptVersion: TITLE_PROMPT_VERSION,
				docPath: request.docPath,
				contextTokenEstimate,
			});

			try {
				const result = await generateTextFn({
					model: openRouterProvider(modelId),
					system: systemMessage.content,
					prompt: userMessage.content,
				});

				const tokenUsage = normalizeTokenUsage(result.usage, contextTokenEstimate);
				const title = normalizeTitle(result.text);

				logger.info("ai.title.response", {
					modelId,
					title,
					tokenUsage,
				});

				return { title, tokenUsage };
			} catch (error) {
				logger.error("ai.title.error", {
					modelId,
					promptVersion: TITLE_PROMPT_VERSION,
					statusCode: getErrorStatusCode(error),
					errorType: toErrorType(error),
				});
				throw error;
			}
		},
	};
};
