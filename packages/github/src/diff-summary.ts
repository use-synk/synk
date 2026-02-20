import type { DiffFile } from "./diff";

const APPROX_CHARACTERS_PER_TOKEN = 4;
const MAX_PATCH_LINES_PER_FILE = 160;

type SummaryStrategy = "full" | "prioritized-truncated" | "fast-model";

export interface FastModelDiffSummarizerInput {
	diff: readonly DiffFile[];
	prioritizedDiffText: string;
	maxTokens: number;
}

export interface FastModelDiffSummarizer {
	summarize(input: FastModelDiffSummarizerInput): Promise<string>;
}

export interface SummarizeDiffOptions {
	fastModelSummarizer?: FastModelDiffSummarizer;
}

export interface SummarizeDiffResult {
	content: string;
	strategy: SummaryStrategy;
	estimatedTokens: number;
	changedFiles: readonly string[];
}

const estimateTokens = (value: string): number =>
	Math.max(1, Math.ceil(value.length / APPROX_CHARACTERS_PER_TOKEN));

const isTestFile = (path: string): boolean =>
	/(^|\/)(__tests__|__mocks__)(\/|$)|\.(test|spec)\.[a-z0-9]+$/iu.test(path);

const isConfigFile = (path: string): boolean => {
	const lower = path.toLowerCase();
	return (
		lower.endsWith(".json") ||
		lower.endsWith(".yaml") ||
		lower.endsWith(".yml") ||
		lower.endsWith(".toml") ||
		lower.endsWith(".ini") ||
		lower.endsWith(".env") ||
		lower.endsWith(".config.js") ||
		lower.endsWith(".config.ts") ||
		lower.endsWith(".config.mjs") ||
		lower.endsWith(".config.cjs")
	);
};

const isSourceFile = (path: string): boolean => {
	if (isTestFile(path) || isConfigFile(path)) {
		return false;
	}
	return /\.(ts|tsx|js|jsx|py|go|rs|java|kt|rb|php|cs|swift)$/iu.test(path);
};

const filePriority = (path: string): number => {
	if (isSourceFile(path)) return 1;
	if (isConfigFile(path)) return 2;
	if (isTestFile(path)) return 3;
	return 2;
};

const sortByDocsRelevance = (files: readonly DiffFile[]): DiffFile[] =>
	[...files].sort((left, right) => {
		const priorityDiff = filePriority(left.filename) - filePriority(right.filename);
		if (priorityDiff !== 0) {
			return priorityDiff;
		}
		const sizeLeft = left.additions + left.deletions;
		const sizeRight = right.additions + right.deletions;
		if (sizeLeft !== sizeRight) {
			return sizeRight - sizeLeft;
		}
		return left.filename.localeCompare(right.filename);
	});

const toPatchLines = (patch: string): readonly string[] => patch.split("\n");

const truncatePatchToAdditionsWithContext = (patch: string): string => {
	const lines = toPatchLines(patch);
	if (lines.length <= MAX_PATCH_LINES_PER_FILE) {
		return patch;
	}

	const selectedLineIndexes = new Set<number>();
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		if (line.startsWith("@@")) {
			selectedLineIndexes.add(index);
			continue;
		}
		if (line.startsWith("+") && !line.startsWith("+++")) {
			selectedLineIndexes.add(index);
			const previousIndex = index - 1;
			const nextIndex = index + 1;
			if (previousIndex >= 0 && (lines[previousIndex] ?? "").startsWith(" ")) {
				selectedLineIndexes.add(previousIndex);
			}
			if (nextIndex < lines.length && (lines[nextIndex] ?? "").startsWith(" ")) {
				selectedLineIndexes.add(nextIndex);
			}
		}
	}

	const kept = lines.filter((_, index) => selectedLineIndexes.has(index));
	if (kept.length === 0) {
		return "[patch omitted: no additions found]";
	}
	return `${kept.join("\n")}\n[patch truncated to additions + context]`;
};

const renderFileDiff = (file: DiffFile, truncateLargePatches: boolean): string => {
	const header = [
		`File: ${file.filename}`,
		`Status: ${file.status}`,
		`Stats: +${file.additions} -${file.deletions}`,
		file.previousFilename === null ? undefined : `Previous filename: ${file.previousFilename}`,
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");

	if (file.patch === null) {
		return `${header}\nPatch:\n[no patch from provider]`;
	}

	const patch = truncateLargePatches ? truncatePatchToAdditionsWithContext(file.patch) : file.patch;
	return `${header}\nPatch:\n${patch}`;
};

const renderDiff = (files: readonly DiffFile[], truncateLargePatches: boolean): string =>
	files.map((file) => renderFileDiff(file, truncateLargePatches)).join("\n\n---\n\n");

const TRUNCATION_MARKER = "[truncated to token budget]";

const trimToBudget = (content: string, maxTokens: number): string => {
	const maxCharacters = maxTokens * APPROX_CHARACTERS_PER_TOKEN;
	if (content.length <= maxCharacters) {
		return content;
	}
	if (maxCharacters <= TRUNCATION_MARKER.length) {
		return TRUNCATION_MARKER.slice(0, maxCharacters);
	}
	const suffix = `\n${TRUNCATION_MARKER}`;
	const head = content.slice(0, Math.max(0, maxCharacters - suffix.length));
	return `${head}${suffix}`;
};

export const summarizeDiff = async (
	diff: readonly DiffFile[],
	maxTokens: number,
	options: SummarizeDiffOptions = {},
): Promise<SummarizeDiffResult> => {
	if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
		throw new Error("maxTokens must be a positive integer.");
	}

	const fullDiff = renderDiff(diff, false);
	if (estimateTokens(fullDiff) <= maxTokens) {
		return {
			content: fullDiff,
			strategy: "full",
			estimatedTokens: estimateTokens(fullDiff),
			changedFiles: diff.map((file) => file.filename),
		};
	}

	const prioritized = sortByDocsRelevance(diff);
	const truncated = renderDiff(prioritized, true);
	if (estimateTokens(truncated) <= maxTokens) {
		return {
			content: truncated,
			strategy: "prioritized-truncated",
			estimatedTokens: estimateTokens(truncated),
			changedFiles: prioritized.map((file) => file.filename),
		};
	}

	if (options.fastModelSummarizer !== undefined) {
		const rawSummary = await options.fastModelSummarizer.summarize({
			diff: prioritized,
			prioritizedDiffText: truncated,
			maxTokens,
		});
		const summary = trimToBudget(rawSummary, maxTokens);
		return {
			content: summary,
			strategy: "fast-model",
			estimatedTokens: estimateTokens(summary),
			changedFiles: prioritized.map((file) => file.filename),
		};
	}

	throw new Error(
		"Diff exceeds token budget after truncation and no fastModelSummarizer was provided.",
	);
};
