import { type PromptMessage } from "./types.js";

export const VERSION = "1.0.0";

export type GenerationPromptParams = {
	diff: string;
	docFilePath: string;
	docFileContent: string;
	frameworkConventions?: string;
	customInstructions?: string;
};

const SYSTEM_CONTENT = `You are a documentation writer for a software project. Update existing documentation to reflect code changes.

Guidelines:
- Make minimal, targeted changes to the documentation
- Preserve the existing style, tone, and formatting exactly
- Only update sections affected by the code change
- Do not add new unrelated sections or content
- Do not remove existing content unless it is explicitly invalidated by the change
- Keep structural elements (headings, lists, code blocks) in the same format

Respond with the complete updated document content and a brief description of what changed.`;

const buildUserContent = (params: GenerationPromptParams): string => {
	const sections: string[] = [
		"Update the following documentation file to reflect the code change.",
		"",
		"## Current Documentation Content",
		"<document>",
		params.docFileContent,
		"</document>",
		"",
		"## Code Diff",
		"<diff>",
		params.diff,
		"</diff>",
	];

	if (params.frameworkConventions) {
		sections.push("", "## Framework Conventions", params.frameworkConventions);
	}

	if (params.customInstructions) {
		sections.push("", "## Custom Instructions", params.customInstructions);
	}

	sections.push(
		"",
		"Provide:",
		"1. The complete updated documentation content (updatedContent) — return the full file, not just changed sections",
		"2. A brief description of what you changed (changeDescription) — use an empty string if no changes were needed",
	);

	return sections.join("\n");
};

export const buildGenerationPrompt = (params: GenerationPromptParams): [PromptMessage, PromptMessage] => [
	{ role: "system", content: SYSTEM_CONTENT },
	{ role: "user", content: buildUserContent(params) },
];
