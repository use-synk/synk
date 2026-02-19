import type { DiffFile } from "./diff.js";

const APPROX_CHARACTERS_PER_TOKEN = 4;
const MAX_PATCH_LINES_PER_FILE = 160;

type SummaryStrategy = "full" | "prioritized-truncated" | "fast-model" | "heuristic-structured";

type SymbolChanges = {
	addedFunctions: string[];
	removedFunctions: string[];
	addedEndpoints: string[];
	removedEndpoints: string[];
	addedTypes: string[];
	removedTypes: string[];
};

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
		lower.endsWith(".config.cjs") ||
		/\/(package\.json|tsconfig\.[^/]+|biome\.json|turbo\.json|docker-compose\.ya?ml)$/u.test(lower)
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

const toUniqueSortedList = (values: Iterable<string>): string[] => [...new Set(values)].sort();

const collectSymbolChanges = (diff: readonly DiffFile[]): SymbolChanges => {
	const addedFunctions = new Set<string>();
	const removedFunctions = new Set<string>();
	const addedEndpoints = new Set<string>();
	const removedEndpoints = new Set<string>();
	const addedTypes = new Set<string>();
	const removedTypes = new Set<string>();

	for (const file of diff) {
		if (file.patch === null) {
			continue;
		}
		for (const line of file.patch.split("\n")) {
			if (line.length === 0) {
				continue;
			}
			const isAddition = line.startsWith("+") && !line.startsWith("+++");
			const isRemoval = line.startsWith("-") && !line.startsWith("---");
			if (!isAddition && !isRemoval) {
				continue;
			}
			const content = line.slice(1).trim();
			if (content.length === 0) {
				continue;
			}

			const register = (collection: Set<string>, symbol: string): void => {
				if (symbol.length > 0) {
					collection.add(symbol);
				}
			};

			const functionMatch =
				content.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/u) ??
				content.match(
					/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/u,
				) ??
				content.match(/^def\s+([A-Za-z0-9_]+)/u);
			const endpointMatch = content.match(
				/(?:router|app)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/u,
			);
			const typeMatch =
				content.match(/^(?:export\s+)?(?:type|interface|enum)\s+([A-Za-z0-9_$]+)/u) ??
				content.match(/^class\s+([A-Za-z0-9_$]+)/u);

			if (isAddition && functionMatch?.[1] !== undefined) {
				register(addedFunctions, functionMatch[1]);
			}
			if (isRemoval && functionMatch?.[1] !== undefined) {
				register(removedFunctions, functionMatch[1]);
			}
			if (endpointMatch?.[1] !== undefined && endpointMatch[2] !== undefined) {
				const endpoint = `${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}`;
				if (isAddition) {
					register(addedEndpoints, endpoint);
				}
				if (isRemoval) {
					register(removedEndpoints, endpoint);
				}
			}
			if (typeMatch?.[1] !== undefined) {
				if (isAddition) {
					register(addedTypes, typeMatch[1]);
				}
				if (isRemoval) {
					register(removedTypes, typeMatch[1]);
				}
			}
		}
	}

	return {
		addedFunctions: toUniqueSortedList(addedFunctions),
		removedFunctions: toUniqueSortedList(removedFunctions),
		addedEndpoints: toUniqueSortedList(addedEndpoints),
		removedEndpoints: toUniqueSortedList(removedEndpoints),
		addedTypes: toUniqueSortedList(addedTypes),
		removedTypes: toUniqueSortedList(removedTypes),
	};
};

const createSemanticSummary = (diff: readonly DiffFile[], symbols: SymbolChanges): string => {
	const touchedSourceFiles = diff.filter((file) => isSourceFile(file.filename)).length;
	const touchedConfigFiles = diff.filter((file) => isConfigFile(file.filename)).length;
	const touchedTestFiles = diff.filter((file) => isTestFile(file.filename)).length;

	const parts: string[] = [];
	if (symbols.addedEndpoints.length > 0 || symbols.removedEndpoints.length > 0) {
		parts.push("API surface changed through endpoint updates.");
	}
	if (symbols.addedTypes.length > 0 || symbols.removedTypes.length > 0) {
		parts.push("Type contracts changed and may require docs updates.");
	}
	if (symbols.addedFunctions.length > 0 || symbols.removedFunctions.length > 0) {
		parts.push("Implementation logic changed through function updates.");
	}
	if (touchedConfigFiles > 0) {
		parts.push("Configuration changed and may affect setup or runtime behavior.");
	}
	if (touchedTestFiles > 0 && touchedSourceFiles === 0 && touchedConfigFiles === 0) {
		parts.push("Changes appear test-only.");
	}
	if (parts.length === 0) {
		parts.push("General file-level changes detected.");
	}
	return parts.join(" ");
};

const asBulletList = (label: string, values: readonly string[]): string =>
	values.length === 0 ? `${label}: none` : `${label}: ${values.join(", ")}`;

const createStructuredSummary = (diff: readonly DiffFile[]): string => {
	const symbols = collectSymbolChanges(diff);
	const files = diff.map(
		(file) => `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`,
	);

	return [
		"Structured diff summary:",
		"Changed files:",
		...files,
		"",
		"Symbol-level changes:",
		asBulletList("Added functions", symbols.addedFunctions),
		asBulletList("Removed functions", symbols.removedFunctions),
		asBulletList("Added endpoints", symbols.addedEndpoints),
		asBulletList("Removed endpoints", symbols.removedEndpoints),
		asBulletList("Added types", symbols.addedTypes),
		asBulletList("Removed types", symbols.removedTypes),
		"",
		`Semantic meaning: ${createSemanticSummary(diff, symbols)}`,
	].join("\n");
};

const trimToBudget = (content: string, maxTokens: number): string => {
	const maxCharacters = maxTokens * APPROX_CHARACTERS_PER_TOKEN;
	if (content.length <= maxCharacters) {
		return content;
	}
	const head = content.slice(0, Math.max(0, maxCharacters - 28));
	return `${head}\n[truncated to token budget]`;
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

	const heuristicSummary = trimToBudget(createStructuredSummary(prioritized), maxTokens);
	return {
		content: heuristicSummary,
		strategy: "heuristic-structured",
		estimatedTokens: estimateTokens(heuristicSummary),
		changedFiles: prioritized.map((file) => file.filename),
	};
};
