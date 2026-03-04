import { describe, expect, it } from "vitest";
import { VERSION, buildTriagePrompt, type TriagePromptParams } from "../../prompts/triage.js";

const minimalParams: TriagePromptParams = {
	diff: "diff --git a/src/api.ts b/src/api.ts\n+export const newEndpoint = () => {};",
	docFileTree: ["docs/api.md", "docs/configuration.md"],
};

describe("buildTriagePrompt", () => {
	it("returns exactly two messages", () => {
		const messages = buildTriagePrompt(minimalParams);
		expect(messages).toHaveLength(2);
	});

	it("first message has role system", () => {
		const [system] = buildTriagePrompt(minimalParams);
		expect(system.role).toBe("system");
	});

	it("second message has role user", () => {
		const [, user] = buildTriagePrompt(minimalParams);
		expect(user.role).toBe("user");
	});

	it("system message content is not empty", () => {
		const [system] = buildTriagePrompt(minimalParams);
		expect(system.content.trim().length).toBeGreaterThan(0);
	});

	it("user message content is not empty", () => {
		const [, user] = buildTriagePrompt(minimalParams);
		expect(user.content.trim().length).toBeGreaterThan(0);
	});

	it("user message contains the diff", () => {
		const [, user] = buildTriagePrompt(minimalParams);
		expect(user.content).toContain(minimalParams.diff);
	});

	it("user message contains all doc file tree entries", () => {
		const [, user] = buildTriagePrompt(minimalParams);
		for (const file of minimalParams.docFileTree) {
			expect(user.content).toContain(file);
		}
	});

	it("user message includes framework conventions when provided", () => {
		const params: TriagePromptParams = {
			...minimalParams,
			frameworkConventions: "Use Next.js App Router conventions.",
		};
		const [, user] = buildTriagePrompt(params);
		expect(user.content).toContain("Use Next.js App Router conventions.");
	});

	it("user message excludes Framework Conventions section when not provided", () => {
		const [, user] = buildTriagePrompt(minimalParams);
		expect(user.content).not.toContain("## Framework Conventions");
	});

	it("user message includes custom instructions when provided", () => {
		const params: TriagePromptParams = {
			...minimalParams,
			customInstructions: "Always flag changes to public APIs.",
		};
		const [, user] = buildTriagePrompt(params);
		expect(user.content).toContain("Always flag changes to public APIs.");
	});

	it("user message excludes Custom Instructions section when not provided", () => {
		const [, user] = buildTriagePrompt(minimalParams);
		expect(user.content).not.toContain("## Custom Instructions");
	});
});

describe("VERSION", () => {
	it("is a non-empty string", () => {
		expect(typeof VERSION).toBe("string");
		expect(VERSION.trim().length).toBeGreaterThan(0);
	});
});
