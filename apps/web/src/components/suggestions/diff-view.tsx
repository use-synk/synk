import { cn } from "@/lib/utils";
import { codeToTokens } from "shiki";
import type { RenderedHunk, RenderedLine } from "./diff-view-utils";
import { buildDiffLines, buildHunks, buildRenderedHunks } from "./diff-view-utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type DiffViewProps = {
	/** Full original file content. */
	oldContent: string;
	/** Full updated file content. */
	newContent: string;
	/**
	 * Shiki language identifier (e.g. "typescript", "mdx").
	 * Falls back to "text" when the identifier is unrecognised.
	 */
	language: string;
	/** Optional filename shown in the file header bar. */
	filename?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Server component that renders a GitHub-style diff view with:
 *  - Syntax highlighting via shiki
 *  - Old/new line numbers
 *  - Hunk headers
 *  - Line-level +/- markers and background colours
 *  - Word/character-level inline highlighting
 *  - 3 context lines before and after each changed region
 */
export async function DiffView({ oldContent, newContent, language, filename }: DiffViewProps) {
	const diffLines = buildDiffLines(oldContent, newContent);
	const hunks = buildHunks(diffLines);

	if (hunks.length === 0) {
		return (
			<div className="font-mono text-sm rounded-md border border-stone-200 overflow-hidden bg-white">
				<div className="px-4 py-3 text-stone-400 text-xs">No changes</div>
			</div>
		);
	}

	const safeLanguage = await resolveLanguage(language);
	// Guarantee non-empty strings — codeToTokens may behave unexpectedly on ""
	const safeOld = oldContent || "\n";
	const safeNew = newContent || "\n";

	const [oldResult, newResult] = await Promise.all([
		codeToTokens(safeOld, { lang: safeLanguage, theme: "github-light" }),
		codeToTokens(safeNew, { lang: safeLanguage, theme: "github-light" }),
	]);

	const renderedHunks = buildRenderedHunks(hunks, oldResult.tokens, newResult.tokens);

	return (
		<div className="font-mono text-xs rounded-md border border-stone-200 overflow-x-auto bg-white">
			{filename !== undefined && (
				<div className="px-4 py-2 bg-stone-50 border-b border-stone-200 text-stone-500 text-xs">
					{filename}
				</div>
			)}
			{renderedHunks.map((hunk, i) => (
				<DiffHunk key={hunk.header + i} hunk={hunk} isFirst={i === 0} />
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Internal: language resolution
// ---------------------------------------------------------------------------

/**
 * Returns the language identifier if shiki supports it, otherwise "text".
 * Uses a lightweight test tokenisation to avoid importing the full bundled
 * language registry.
 */
async function resolveLanguage(language: string): Promise<string> {
	try {
		await codeToTokens("", { lang: language, theme: "github-light" });
		return language;
	} catch {
		return "text";
	}
}

// ---------------------------------------------------------------------------
// Internal: hunk rendering
// ---------------------------------------------------------------------------

function DiffHunk({ hunk, isFirst }: { hunk: RenderedHunk; isFirst: boolean }) {
	return (
		<div>
			<table className="w-full border-collapse">
				<tbody>
					<HunkHeaderRow header={hunk.header} isFirst={isFirst} />
					{hunk.lines.map((line, j) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: line order is stable render-to-render
						<DiffLineRow key={j} line={line} />
					))}
				</tbody>
			</table>
		</div>
	);
}

function HunkHeaderRow({ header, isFirst }: { header: string; isFirst: boolean }) {
	return (
		<tr className={cn("bg-[#def4ff]", !isFirst && "border-t border-stone-200")}>
			{/* Empty cells matching the gutter columns so the header text aligns with code */}
			<td colSpan={2} className="bg-[#b6e3ff]" />
			<td className="bg-[#def4ff]" />
			<td className="pl-2 pr-6 py-1 bg-[#def4ff]">
				<span className="text-stone-500 font-medium">{header}</span>
			</td>
		</tr>
	);
}

// ---------------------------------------------------------------------------
// Internal: line rendering
// ---------------------------------------------------------------------------

function DiffLineRow({ line }: { line: RenderedLine }) {
	const isAdded = line.type === "added";
	const isRemoved = line.type === "removed";

	return (
		<tr className={cn(isAdded && "bg-[#dbfbe1]", isRemoved && "bg-[#ffebe9]")}>
			{/* Old line number */}
			<td
				className={cn(
					"select-none w-14 pl-4 pr-2 py-0.5 text-right text-stone-500 text-xs",
					"align-top tabular-nums leading-5",
					isAdded && "bg-[#aceebb] text-stone-800",
					isRemoved && "bg-[#ffcecb] text-stone-800",
				)}
			>
				{line.oldLineNumber}
			</td>
			{/* New line number */}
			<td
				className={cn(
					"select-none w-14 pl-2 pr-4 py-0.5 text-right text-stone-500 text-xs",
					"align-top tabular-nums leading-5",
					isAdded && "bg-[#aceebb] text-stone-800",
					isRemoved && "bg-[#ffcecb] text-stone-800",
				)}
			>
				{line.newLineNumber}
			</td>
			{/* Change marker */}
			<td
				className={cn(
					"select-none w-6 pl-3 pr-1 py-0.5 text-xs align-top leading-5",
					isAdded && "text-stone-800",
					isRemoved && "text-stone-800",
					!isAdded && !isRemoved && "text-stone-300",
				)}
			>
				{isAdded ? "+" : isRemoved ? "-" : " "}
			</td>
			{/* Code content */}
			<td className="pl-2 pr-6 py-0.5 whitespace-pre align-top leading-5">
				{line.spans.map((span, k) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: spans are positional within a stable line
						key={k}
						style={{ color: span.color }}
						className={cn(
							span.highlight === "added" && "bg-[#aceebb] rounded-xs",
							span.highlight === "removed" && "bg-[#ffcecb] rounded-xs",
						)}
					>
						{span.content}
					</span>
				))}
			</td>
		</tr>
	);
}
