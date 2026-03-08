import type { PromptMessage, PromptVersion } from "./types.js";

export const VERSION: PromptVersion = "1.0.0";

export type TitlePromptParams = {
	docPath: string;
	reasoning: string | undefined;
	beforeExcerpt: string;
	afterExcerpt: string;
};

const SYSTEM_CONTENT = `You are a technical writer. Generate a short, precise title for a documentation change suggestion.

Rules:
- Maximum 80 characters
- Use the format "{area}: {action}" when a clear area exists, e.g. "Teams & roles: add owner permission matrix"
- Otherwise use just "{action}", e.g. "Add BETTER_AUTH_URL to all environment docs"
- Use imperative mood: "add", "update", "remove" — not "added", "updated", "removed"
- Do not start with "Update" or "Change" — be specific about what changes
- Do not include file paths in the title
- Respond with only the title string, no quotes or trailing punctuation`;

const buildUserContent = (params: TitlePromptParams): string => {
	const lines: string[] = [`File: ${params.docPath}`];

	if (params.reasoning !== undefined && params.reasoning.trim().length > 0) {
		lines.push(`Change description: ${params.reasoning}`);
	}

	if (params.beforeExcerpt.trim().length > 0) {
		lines.push(`Before (excerpt):\n${params.beforeExcerpt}`);
	}

	if (params.afterExcerpt.trim().length > 0) {
		lines.push(`After (excerpt):\n${params.afterExcerpt}`);
	}

	lines.push("Generate a short title for this suggestion:");

	return lines.join("\n\n");
};

export const buildTitlePrompt = (params: TitlePromptParams): [PromptMessage, PromptMessage] => [
	{ role: "system", content: SYSTEM_CONTENT },
	{ role: "user", content: buildUserContent(params) },
];
