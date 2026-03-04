import type { LanguageModelUsage } from "ai";

export type UsageLike = {
	inputTokens?: number | undefined;
	outputTokens?: number | undefined;
	totalTokens?: number | undefined;
	promptTokens?: number | undefined;
	completionTokens?: number | undefined;
};

export type AiTokenUsage = {
	prompt: number;
	completion: number;
	total: number;
};

export const normalizeTokenUsage = (
	usage: UsageLike | undefined,
	estimate: number,
): AiTokenUsage => {
	const prompt = usage?.inputTokens ?? usage?.promptTokens ?? estimate;
	const completion = usage?.outputTokens ?? usage?.completionTokens ?? 0;
	const total = usage?.totalTokens ?? prompt + completion;
	return { prompt, completion, total };
};

// Bridges LanguageModelUsage (SDK type) to UsageLike (internal type)
export const toUsageLike = (usage: LanguageModelUsage): UsageLike => usage;
