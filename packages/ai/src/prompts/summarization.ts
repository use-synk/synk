import type { PromptMessage, PromptVersion } from "./types.js";

export const VERSION: PromptVersion = "1.0.0";

export type DocumentChange = {
	filePath: string;
	changeDescription: string;
};

export type SummarizationPromptParams = {
	changes: DocumentChange[];
	projectName?: string;
};

const SYSTEM_CONTENT = `You are a technical writer for a software project. Summarize a set of documentation changes into a concise, user-facing changelog entry.

Guidelines:
- Group related changes under a single theme where appropriate
- Use clear, non-technical language suitable for end users
- Be concise: one to three sentences per distinct change area
- Preserve the significance of each change without redundancy
- Do not invent details not present in the input

Respond with a single changelog summary string.`;

const buildSummarizationUserContent = (params: SummarizationPromptParams): string => {
	const projectLine = params.projectName ? `Project: ${params.projectName}\n\n` : "";
	const changeLines = params.changes
		.map((c) => `- ${c.filePath}: ${c.changeDescription}`)
		.join("\n");

	return [
		`${projectLine}Summarize the following documentation changes into a single changelog entry:`,
		"",
		changeLines,
		"",
		"Provide a concise summary suitable for a changelog or release notes.",
	].join("\n");
};

export const buildSummarizationPrompt = (
	params: SummarizationPromptParams,
): [PromptMessage, PromptMessage] => {
	if (params.changes.length === 0) {
		throw new TypeError("changes must not be empty.");
	}

	return [
		{ role: "system", content: SYSTEM_CONTENT },
		{ role: "user", content: buildSummarizationUserContent(params) },
	];
};
