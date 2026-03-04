import type { PromptMessage, PromptVersion } from "./types.js";

export const VERSION: PromptVersion = "1.0.0";

export type TriagePromptParams = {
	diff: string;
	docFileTree: string[];
	frameworkConventions?: string;
	customInstructions?: string;
};

const SYSTEM_CONTENT = `You are a documentation reviewer for a software project. Analyze code changes and determine whether they require documentation updates.

Review the provided code diff and identify:
- New public APIs, features, configuration options, or behaviors that need documentation
- Changes or removals of existing documented behavior
- Which specific documentation files are affected

Guidelines:
- Be conservative: only flag changes that clearly require documentation updates
- Internal refactors, performance improvements, and test-only changes rarely need documentation updates
- Focus on user-facing changes: public APIs, CLI options, configuration, behavior

Respond with a structured JSON object matching the required schema.`;

const buildTriageUserContent = (params: TriagePromptParams): string => {
	const sections: string[] = [
		"Analyze the following code change and determine whether the project documentation requires updates.",
		"",
		"## Code Diff",
		params.diff,
		"",
		"## Documentation File Tree",
		params.docFileTree.map((f) => `- ${f}`).join("\n"),
	];

	if (params.frameworkConventions) {
		sections.push("", "## Framework Conventions", params.frameworkConventions);
	}

	if (params.customInstructions) {
		sections.push("", "## Custom Instructions", params.customInstructions);
	}

	sections.push(
		"",
		"Identify:",
		"1. Whether any documentation needs updating (needsUpdate: true/false)",
		"2. Your confidence level from 0.0 (uncertain) to 1.0 (certain)",
		"3. Which documentation files require updates (exact paths from the file tree; empty array if none)",
		"4. Brief reasoning for your decision",
	);

	return sections.join("\n");
};

export const buildTriagePrompt = (params: TriagePromptParams): [PromptMessage, PromptMessage] => [
	{ role: "system", content: SYSTEM_CONTENT },
	{ role: "user", content: buildTriageUserContent(params) },
];
