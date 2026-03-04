import { describe, expect, it } from "vitest";
import {
	VERSION,
	buildSummarizationPrompt,
	type SummarizationPromptParams,
} from "../../prompts/summarization.js";

const minimalParams: SummarizationPromptParams = {
	changes: [
		{ filePath: "docs/api.md", changeDescription: "Added deleteUser endpoint documentation." },
		{
			filePath: "docs/configuration.md",
			changeDescription: "Updated rate limiting configuration options.",
		},
	],
};

describe("buildSummarizationPrompt", () => {
	it("returns exactly two messages", () => {
		const messages = buildSummarizationPrompt(minimalParams);
		expect(messages).toHaveLength(2);
	});

	it("first message has role system", () => {
		const [system] = buildSummarizationPrompt(minimalParams);
		expect(system.role).toBe("system");
	});

	it("second message has role user", () => {
		const [, user] = buildSummarizationPrompt(minimalParams);
		expect(user.role).toBe("user");
	});

	it("system message content is not empty", () => {
		const [system] = buildSummarizationPrompt(minimalParams);
		expect(system.content.trim().length).toBeGreaterThan(0);
	});

	it("user message content is not empty", () => {
		const [, user] = buildSummarizationPrompt(minimalParams);
		expect(user.content.trim().length).toBeGreaterThan(0);
	});

	it("user message contains all change file paths", () => {
		const [, user] = buildSummarizationPrompt(minimalParams);
		for (const change of minimalParams.changes) {
			expect(user.content).toContain(change.filePath);
		}
	});

	it("user message contains all change descriptions", () => {
		const [, user] = buildSummarizationPrompt(minimalParams);
		for (const change of minimalParams.changes) {
			expect(user.content).toContain(change.changeDescription);
		}
	});

	it("user message includes project name when provided", () => {
		const params: SummarizationPromptParams = {
			...minimalParams,
			projectName: "Synk",
		};
		const [, user] = buildSummarizationPrompt(params);
		expect(user.content).toContain("Synk");
	});

	it("user message excludes project line when project name is not provided", () => {
		const [, user] = buildSummarizationPrompt(minimalParams);
		expect(user.content).not.toContain("Project:");
	});

	it("handles a single change entry", () => {
		const params: SummarizationPromptParams = {
			changes: [{ filePath: "docs/index.md", changeDescription: "Updated introduction." }],
		};
		const messages = buildSummarizationPrompt(params);
		expect(messages).toHaveLength(2);
		const [, user] = messages;
		expect(user.content).toContain("docs/index.md");
		expect(user.content).toContain("Updated introduction.");
	});
});

describe("VERSION", () => {
	it("is a non-empty string", () => {
		expect(typeof VERSION).toBe("string");
		expect(VERSION.trim().length).toBeGreaterThan(0);
	});
});
