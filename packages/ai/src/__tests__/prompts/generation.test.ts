import { describe, expect, it } from "vitest";
import {
	type GenerationPromptParams,
	VERSION,
	buildGenerationPrompt,
} from "../../prompts/generation.js";

const minimalParams: GenerationPromptParams = {
	diff: "diff --git a/src/api.ts b/src/api.ts\n+export const newEndpoint = () => {};",
	docFilePath: "docs/api.md",
	docFileContent: "# API\n\nThis page documents the public API.",
};

describe("buildGenerationPrompt", () => {
	it("returns exactly two messages", () => {
		const messages = buildGenerationPrompt(minimalParams);
		expect(messages).toHaveLength(2);
	});

	it("first message has role system", () => {
		const [system] = buildGenerationPrompt(minimalParams);
		expect(system.role).toBe("system");
	});

	it("second message has role user", () => {
		const [, user] = buildGenerationPrompt(minimalParams);
		expect(user.role).toBe("user");
	});

	it("system message content is not empty", () => {
		const [system] = buildGenerationPrompt(minimalParams);
		expect(system.content.trim().length).toBeGreaterThan(0);
	});

	it("user message content is not empty", () => {
		const [, user] = buildGenerationPrompt(minimalParams);
		expect(user.content.trim().length).toBeGreaterThan(0);
	});

	it("user message contains the diff", () => {
		const [, user] = buildGenerationPrompt(minimalParams);
		expect(user.content).toContain(minimalParams.diff);
	});

	it("user message contains the document content", () => {
		const [, user] = buildGenerationPrompt(minimalParams);
		expect(user.content).toContain(minimalParams.docFileContent);
	});

	it("user message contains the file path", () => {
		const [, user] = buildGenerationPrompt(minimalParams);
		expect(user.content).toContain(minimalParams.docFilePath);
	});

	it("user message includes framework conventions when provided", () => {
		const params: GenerationPromptParams = {
			...minimalParams,
			frameworkConventions: "Follow MDX formatting conventions.",
		};
		const [, user] = buildGenerationPrompt(params);
		expect(user.content).toContain("Follow MDX formatting conventions.");
	});

	it("user message excludes Framework Conventions section when not provided", () => {
		const [, user] = buildGenerationPrompt(minimalParams);
		expect(user.content).not.toContain("## Framework Conventions");
	});

	it("user message includes custom instructions when provided", () => {
		const params: GenerationPromptParams = {
			...minimalParams,
			customInstructions: "Preserve all code examples verbatim.",
		};
		const [, user] = buildGenerationPrompt(params);
		expect(user.content).toContain("Preserve all code examples verbatim.");
	});

	it("user message excludes Custom Instructions section when not provided", () => {
		const [, user] = buildGenerationPrompt(minimalParams);
		expect(user.content).not.toContain("## Custom Instructions");
	});
});

describe("VERSION", () => {
	it("is a semver-formatted string", () => {
		expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
