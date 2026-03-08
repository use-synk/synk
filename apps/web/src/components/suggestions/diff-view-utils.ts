import { diffLines, diffWords } from "diff";
import type { ThemedToken } from "shiki";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type DiffLineType = "added" | "removed" | "unchanged";

export type DiffLine = {
	type: DiffLineType;
	content: string;
	oldLineNumber: number | undefined;
	newLineNumber: number | undefined;
};

export type Hunk = {
	header: string;
	lines: DiffLine[];
};

export type WordHighlight = {
	start: number;
	end: number;
	type: "added" | "removed";
};

export type RenderedSpan = {
	content: string;
	color: string;
	highlight: "added" | "removed" | undefined;
};

export type RenderedLine = {
	type: DiffLineType;
	oldLineNumber: number | undefined;
	newLineNumber: number | undefined;
	spans: RenderedSpan[];
};

export type RenderedHunk = {
	header: string;
	lines: RenderedLine[];
};

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const CONTEXT_LINES = 3;
const FALLBACK_COLOR = "#24292e";

// ---------------------------------------------------------------------------
// Public: build diff lines
// ---------------------------------------------------------------------------

/**
 * Computes a flat list of diff lines from two file contents.
 * Each line carries its old/new line number and diff type.
 */
export function buildDiffLines(oldContent: string, newContent: string): DiffLine[] {
	const changes = diffLines(oldContent, newContent);
	const lines: DiffLine[] = [];
	let oldLineNum = 1;
	let newLineNum = 1;

	for (const change of changes) {
		const parts = change.value.split("\n");
		// diffLines appends a trailing newline — the resulting empty string is noise
		if (parts[parts.length - 1] === "") {
			parts.pop();
		}

		if (change.added) {
			for (const content of parts) {
				lines.push({
					type: "added",
					content,
					oldLineNumber: undefined,
					newLineNumber: newLineNum++,
				});
			}
		} else if (change.removed) {
			for (const content of parts) {
				lines.push({
					type: "removed",
					content,
					oldLineNumber: oldLineNum++,
					newLineNumber: undefined,
				});
			}
		} else {
			for (const content of parts) {
				lines.push({
					type: "unchanged",
					content,
					oldLineNumber: oldLineNum++,
					newLineNumber: newLineNum++,
				});
			}
		}
	}

	return lines;
}

// ---------------------------------------------------------------------------
// Public: build hunks (context-trimmed groups with @@ headers)
// ---------------------------------------------------------------------------

/**
 * Groups diff lines into hunks, each containing at most CONTEXT_LINES
 * unchanged lines before and after every changed region.
 */
export function buildHunks(lines: DiffLine[]): Hunk[] {
	if (lines.length === 0) return [];

	const changedIndices = new Set<number>();
	for (let i = 0; i < lines.length; i++) {
		if (lines[i]!.type !== "unchanged") changedIndices.add(i);
	}

	if (changedIndices.size === 0) return [];

	// Expand each changed line with its context window
	const includedIndices = new Set<number>();
	for (const idx of changedIndices) {
		const from = Math.max(0, idx - CONTEXT_LINES);
		const to = Math.min(lines.length - 1, idx + CONTEXT_LINES);
		for (let i = from; i <= to; i++) includedIndices.add(i);
	}

	// Split contiguous index runs into separate hunks
	const sortedIndices = Array.from(includedIndices).sort((a, b) => a - b);
	const hunkGroups: DiffLine[][] = [];
	let currentGroup: DiffLine[] = [];
	let prevIdx = -2;

	for (const idx of sortedIndices) {
		if (prevIdx >= 0 && idx !== prevIdx + 1) {
			hunkGroups.push(currentGroup);
			currentGroup = [];
		}
		currentGroup.push(lines[idx]!);
		prevIdx = idx;
	}
	if (currentGroup.length > 0) hunkGroups.push(currentGroup);

	return hunkGroups.map((group) => ({ header: buildHunkHeader(group), lines: group }));
}

function buildHunkHeader(lines: DiffLine[]): string {
	const firstOld = lines.find((l) => l.oldLineNumber !== undefined)?.oldLineNumber ?? 1;
	const firstNew = lines.find((l) => l.newLineNumber !== undefined)?.newLineNumber ?? 1;
	const oldCount = lines.filter((l) => l.type !== "added").length;
	const newCount = lines.filter((l) => l.type !== "removed").length;
	return `@@ -${firstOld},${oldCount} +${firstNew},${newCount} @@`;
}

// ---------------------------------------------------------------------------
// Public: word-level highlight computation
// ---------------------------------------------------------------------------

/**
 * Returns character-offset highlight ranges for both the old and new line
 * in a removed/added pair. Uses word-level diffing.
 */
export function computeWordHighlights(
	oldLine: string,
	newLine: string,
): { oldHighlights: WordHighlight[]; newHighlights: WordHighlight[] } {
	const changes = diffWords(oldLine, newLine);
	const oldHighlights: WordHighlight[] = [];
	const newHighlights: WordHighlight[] = [];
	let oldOffset = 0;
	let newOffset = 0;

	for (const change of changes) {
		const len = change.value.length;
		if (change.removed) {
			oldHighlights.push({ start: oldOffset, end: oldOffset + len, type: "removed" });
			oldOffset += len;
		} else if (change.added) {
			newHighlights.push({ start: newOffset, end: newOffset + len, type: "added" });
			newOffset += len;
		} else {
			oldOffset += len;
			newOffset += len;
		}
	}

	return { oldHighlights, newHighlights };
}

// ---------------------------------------------------------------------------
// Public: merge shiki tokens with word highlights into render spans
// ---------------------------------------------------------------------------

/**
 * Splits shiki tokens at word-highlight boundaries, yielding spans that
 * carry both a syntax color and an optional background highlight type.
 */
export function applyWordHighlights(
	tokens: ThemedToken[],
	highlights: WordHighlight[],
): RenderedSpan[] {
	if (tokens.length === 0) return [{ content: "", color: FALLBACK_COLOR, highlight: undefined }];

	type CharMeta = { color: string; highlight: "added" | "removed" | undefined };
	const chars: CharMeta[] = [];

	for (const token of tokens) {
		const color = token.color ?? FALLBACK_COLOR;
		for (const _char of token.content) chars.push({ color, highlight: undefined });
	}

	for (const h of highlights) {
		for (let i = h.start; i < h.end && i < chars.length; i++) {
			chars[i]!.highlight = h.type;
		}
	}

	const spans: RenderedSpan[] = [];
	let charIdx = 0;

	for (const token of tokens) {
		const color = token.color ?? FALLBACK_COLOR;
		for (const char of token.content) {
			const meta = chars[charIdx]!;
			const last = spans[spans.length - 1];
			if (last !== undefined && last.color === color && last.highlight === meta.highlight) {
				last.content += char;
			} else {
				spans.push({ content: char, color, highlight: meta.highlight });
			}
			charIdx++;
		}
	}

	return spans;
}

// ---------------------------------------------------------------------------
// Public: build rendered hunks (ties everything together)
// ---------------------------------------------------------------------------

/**
 * Context object passed through rendering helpers to avoid exceeding the
 * 3-parameter limit while keeping access to both token arrays.
 */
type TokenContext = {
	oldTokens: ThemedToken[][];
	newTokens: ThemedToken[][];
};

/**
 * Converts raw hunks + shiki token arrays into fully rendered hunks ready
 * for the React component. Pairs adjacent removed/added blocks for word diff.
 */
export function buildRenderedHunks(
	hunks: Hunk[],
	oldTokens: ThemedToken[][],
	newTokens: ThemedToken[][],
): RenderedHunk[] {
	const ctx: TokenContext = { oldTokens, newTokens };
	return hunks.map((hunk) => ({
		header: hunk.header,
		lines: buildRenderedLines(hunk.lines, ctx),
	}));
}

function buildRenderedLines(lines: DiffLine[], ctx: TokenContext): RenderedLine[] {
	const result: RenderedLine[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]!;

		if (line.type !== "removed") {
			result.push(buildSingleRenderedLine(line, ctx));
			i++;
			continue;
		}

		// Collect the contiguous removed block, then any immediately following added block
		const removed: DiffLine[] = [];
		while (i < lines.length && lines[i]!.type === "removed") {
			removed.push(lines[i]!);
			i++;
		}
		const added: DiffLine[] = [];
		while (i < lines.length && lines[i]!.type === "added") {
			added.push(lines[i]!);
			i++;
		}

		for (const renderedLine of buildRenderedBlock(removed, added, ctx)) {
			result.push(renderedLine);
		}
	}

	return result;
}

function buildSingleRenderedLine(line: DiffLine, ctx: TokenContext): RenderedLine {
	if (line.type === "added") {
		const tokens = ctx.newTokens[(line.newLineNumber ?? 1) - 1] ?? [];
		return {
			type: "added",
			oldLineNumber: undefined,
			newLineNumber: line.newLineNumber,
			spans: applyWordHighlights(tokens, []),
		};
	}
	const tokens = ctx.oldTokens[(line.oldLineNumber ?? 1) - 1] ?? [];
	return {
		type: "unchanged",
		oldLineNumber: line.oldLineNumber,
		newLineNumber: line.newLineNumber,
		spans: applyWordHighlights(tokens, []),
	};
}

function buildRenderedBlock(
	removed: DiffLine[],
	added: DiffLine[],
	ctx: TokenContext,
): RenderedLine[] {
	const result: RenderedLine[] = [];
	const pairCount = Math.min(removed.length, added.length);

	for (let j = 0; j < removed.length; j++) {
		const line = removed[j]!;
		const tokens = ctx.oldTokens[(line.oldLineNumber ?? 1) - 1] ?? [];
		const oldHighlights =
			j < pairCount ? computeWordHighlights(line.content, added[j]!.content).oldHighlights : [];
		result.push({
			type: "removed",
			oldLineNumber: line.oldLineNumber,
			newLineNumber: undefined,
			spans: applyWordHighlights(tokens, oldHighlights),
		});
	}

	for (let j = 0; j < added.length; j++) {
		const line = added[j]!;
		const tokens = ctx.newTokens[(line.newLineNumber ?? 1) - 1] ?? [];
		const newHighlights =
			j < pairCount ? computeWordHighlights(removed[j]!.content, line.content).newHighlights : [];
		result.push({
			type: "added",
			oldLineNumber: undefined,
			newLineNumber: line.newLineNumber,
			spans: applyWordHighlights(tokens, newHighlights),
		});
	}

	return result;
}
