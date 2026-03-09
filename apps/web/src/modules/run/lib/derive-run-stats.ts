import type { runDetailSchema } from "@/api/endpoints";
import type z from "zod";

type RunDetail = z.infer<typeof runDetailSchema>;

type TokenUsage = {
	prompt: number;
	completion: number;
	total: number;
};

export type RunStatsData = {
	durationMs: number | null;
	stepCount: number;
	tokenUsage: TokenUsage;
	docsAffectedCount: number | null;
	firstAffectedDocPath: string | null;
	confidence: number | null;
	suggestionCount: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readNonNegativeNumber(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return null;
	}
	return value;
}

function deriveDurationMs(run: RunDetail): number | null {
	if (run.startedAt === null) {
		return null;
	}

	const startedAt = Date.parse(run.startedAt);
	const endedAt = Date.parse(run.completedAt ?? run.updatedAt);
	if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
		return null;
	}

	return Math.max(0, endedAt - startedAt);
}

function deriveTokenUsage(run: RunDetail): TokenUsage {
	const fallback: TokenUsage = { prompt: 0, completion: 0, total: 0 };
	if (!isRecord(run.tokenUsage)) {
		return fallback;
	}

	const rootPrompt = readNonNegativeNumber(run.tokenUsage.prompt) ?? 0;
	const rootCompletion = readNonNegativeNumber(run.tokenUsage.completion) ?? 0;
	const rootTotal = readNonNegativeNumber(run.tokenUsage.total);

	const totalNode = run.tokenUsage.total;
	if (!isRecord(totalNode)) {
		return {
			prompt: rootPrompt,
			completion: rootCompletion,
			total: rootTotal ?? rootPrompt + rootCompletion,
		};
	}

	const totalPrompt = readNonNegativeNumber(totalNode.prompt) ?? rootPrompt;
	const totalCompletion = readNonNegativeNumber(totalNode.completion) ?? rootCompletion;
	const totalTotal = readNonNegativeNumber(totalNode.total);

	return {
		prompt: totalPrompt,
		completion: totalCompletion,
		total: totalTotal ?? totalPrompt + totalCompletion,
	};
}

export function deriveRunStats(run: RunDetail): RunStatsData {
	let latestAttemptNumber = 0;
	for (const step of run.steps) {
		if (step.attemptNumber > latestAttemptNumber) {
			latestAttemptNumber = step.attemptNumber;
		}
	}

	let stepCount = 0;
	let docsAffectedCount: number | null = null;
	let firstAffectedDocPath: string | null = null;
	let confidence: number | null = null;
	let suggestionCount: number | null = null;

	for (const step of run.steps) {
		if (step.attemptNumber !== latestAttemptNumber) {
			continue;
		}

		stepCount += 1;
		if (step.status !== "completed") {
			continue;
		}

		if (step.stepKey === "run-ai-triage" && isRecord(step.result)) {
			const triageAffectedDocFileCount = readNonNegativeNumber(step.result.affectedDocFileCount);
			if (triageAffectedDocFileCount !== null) {
				docsAffectedCount = triageAffectedDocFileCount;
			}

			const triageConfidence = readNonNegativeNumber(step.result.confidence);
			if (triageConfidence !== null) {
				confidence = triageConfidence;
			}
			continue;
		}

		if (step.stepKey === "run-ai-generation" && isRecord(step.result)) {
			const generatedDocCount = readNonNegativeNumber(step.result.generatedDocCount);
			if (generatedDocCount !== null) {
				docsAffectedCount = generatedDocCount;
			}

			if (Array.isArray(step.result.paths)) {
				const firstPath = step.result.paths.find(
					(path): path is string => typeof path === "string",
				);
				if (firstPath !== undefined) {
					firstAffectedDocPath = firstPath;
				}
			}
			continue;
		}

		if (step.stepKey === "persist-suggestions" && isRecord(step.result)) {
			const persistedCount = readNonNegativeNumber(step.result.persistedCount);
			if (persistedCount !== null) {
				suggestionCount = persistedCount;
			}
		}
	}

	if (docsAffectedCount === null && run.docsAffected !== null) {
		docsAffectedCount = run.docsAffected ? 1 : 0;
	}

	return {
		durationMs: deriveDurationMs(run),
		stepCount,
		tokenUsage: deriveTokenUsage(run),
		docsAffectedCount,
		firstAffectedDocPath,
		confidence,
		suggestionCount,
	};
}
