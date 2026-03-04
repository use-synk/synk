import { describe, expect, it, vi } from "vitest";
import { type DocGenerationRequest, createDocGeneration } from "../generate.js";
import { createLoggerCollector } from "./helpers.js";

const sampleDiff = `
diff --git a/src/api/users.ts b/src/api/users.ts
index 1234567..abcdefg 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,6 +10,12 @@ export const getUser = async (id: string) => {
   return db.users.findUnique({ where: { id } });
 };

+export const deleteUser = async (id: string): Promise<void> => {
+  await db.users.delete({ where: { id } });
+};
`.trim();

const sampleDocFile = {
	path: "docs/api/users.md",
	content: `# Users API

## getUser

Fetch a user by ID.

\`\`\`ts
getUser(id: string): Promise<User>
\`\`\`
`,
};

const updatedDocContent = `# Users API

## getUser

Fetch a user by ID.

\`\`\`ts
getUser(id: string): Promise<User>
\`\`\`

## deleteUser

Delete a user by ID.

\`\`\`ts
deleteUser(id: string): Promise<void>
\`\`\`
`;

describe("createDocGeneration", () => {
	it("returns generation result with updated content and token usage", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: updatedDocContent,
				changeDescription: "Added deleteUser API documentation.",
			},
			usage: { inputTokens: 200, outputTokens: 80, totalTokens: 280 },
		}));

		const { logger, entries } = createLoggerCollector();
		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			logger,
		});

		const request: DocGenerationRequest = {
			diff: sampleDiff,
			docFile: sampleDocFile,
		};

		const result = await generation.generate(request);

		expect(result.filePath).toBe("docs/api/users.md");
		expect(result.updatedContent).toBe(updatedDocContent);
		expect(result.changeDescription).toBe("Added deleteUser API documentation.");
		expect(result.skipped).toBe(false);
		expect(result.tokenUsage).toEqual({ prompt: 200, completion: 80, total: 280 });

		// Verify current content and diff appear in the prompt
		const callArg = generateObjectFn.mock.calls[0][0];
		expect(callArg.prompt).toContain(sampleDocFile.content);
		expect(callArg.prompt).toContain(sampleDiff);
		expect(callArg.system).toContain("documentation writer");

		// Verify request and response are logged
		expect(entries.some((e) => e.message === "ai.generate.request")).toBe(true);
		expect(entries.some((e) => e.message === "ai.generate.response")).toBe(true);
	});

	it("marks result as skipped when updated content is not meaningfully different from original", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: sampleDocFile.content,
				changeDescription: "",
			},
			usage: { inputTokens: 150, outputTokens: 50, totalTokens: 200 },
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await generation.generate({ diff: sampleDiff, docFile: sampleDocFile });

		expect(result.skipped).toBe(true);
	});

	it("skips when content differs only by trailing whitespace", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: `${sampleDocFile.content}   `,
				changeDescription: "",
			},
			usage: undefined,
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await generation.generate({ diff: sampleDiff, docFile: sampleDocFile });

		expect(result.skipped).toBe(true);
	});

	it("ensures trailing newline in returned content", async () => {
		const contentWithoutTrailingNewline = "# Doc\n\nSome content.";

		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: contentWithoutTrailingNewline,
				changeDescription: "Updated content.",
			},
			usage: undefined,
		}));

		const docFile = { path: "docs/test.md", content: "# Old Doc\n\nOld content." };
		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await generation.generate({ diff: "some diff", docFile });

		expect(result.updatedContent.endsWith("\n")).toBe(true);
	});

	it("normalizes CRLF line endings to LF", async () => {
		const crlfContent = "# Doc\r\n\r\nSome updated content.\r\n";

		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: crlfContent,
				changeDescription: "Updated content.",
			},
			usage: undefined,
		}));

		const docFile = { path: "docs/test.md", content: "# Old Doc\n\nOld content.\n" };
		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await generation.generate({ diff: "some diff", docFile });

		expect(result.updatedContent).not.toContain("\r");
	});

	it("calls validateOutput with processed content when provided and result is not skipped", async () => {
		const validateOutput = vi.fn(() => ({ valid: true }));

		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: updatedDocContent,
				changeDescription: "Added deleteUser section.",
			},
			usage: undefined,
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			validateOutput,
		});

		await generation.generate({ diff: sampleDiff, docFile: sampleDocFile });

		expect(validateOutput).toHaveBeenCalledOnce();
		expect(validateOutput).toHaveBeenCalledWith(expect.any(String), "docs/api/users.md");
	});

	it("does not call validateOutput when result is skipped", async () => {
		const validateOutput = vi.fn(() => ({ valid: true }));

		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: sampleDocFile.content,
				changeDescription: "",
			},
			usage: undefined,
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			validateOutput,
		});

		const result = await generation.generate({ diff: sampleDiff, docFile: sampleDocFile });

		expect(result.skipped).toBe(true);
		expect(validateOutput).not.toHaveBeenCalled();
	});

	it("logs a warning when validateOutput reports invalid content", async () => {
		const validateOutput = vi.fn(() => ({
			valid: false,
			errors: ["Missing required frontmatter: title"],
		}));

		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: updatedDocContent,
				changeDescription: "Added deleteUser section.",
			},
			usage: undefined,
		}));

		const { logger, entries } = createLoggerCollector();
		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			validateOutput,
			logger,
		});

		const result = await generation.generate({ diff: sampleDiff, docFile: sampleDocFile });

		// Result is still returned despite validation warning
		expect(result.skipped).toBe(false);
		expect(entries.some((e) => e.message === "ai.generate.validation_failed")).toBe(true);
	});

	it("includes framework conventions and custom instructions in the user prompt when provided", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: updatedDocContent,
				changeDescription: "Updated docs.",
			},
			usage: undefined,
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		await generation.generate({
			diff: sampleDiff,
			docFile: sampleDocFile,
			frameworkConventions: "Use JSDoc comments for all public APIs.",
			customInstructions: "Always document new REST endpoints.",
		});

		const callArg = generateObjectFn.mock.calls[0][0];
		expect(callArg.prompt).toContain("Use JSDoc comments for all public APIs.");
		expect(callArg.prompt).toContain("Always document new REST endpoints.");
	});

	it("falls back to estimated token count when provider returns no usage", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: updatedDocContent,
				changeDescription: "Updated content.",
			},
			usage: undefined,
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await generation.generate({ diff: sampleDiff, docFile: sampleDocFile });

		expect(result.tokenUsage.prompt).toBeGreaterThan(0);
		expect(result.tokenUsage.completion).toBe(0);
		expect(result.tokenUsage.total).toBe(result.tokenUsage.prompt);
	});

	it("uses the generate model from the configured model selection", async () => {
		const modelCalls: string[] = [];
		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: updatedDocContent,
				changeDescription: "Updated content.",
			},
			usage: undefined,
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			models: { generate: "openai/gpt-5" },
			providerFactory: () => (modelId: string) => {
				modelCalls.push(modelId);
				return modelId;
			},
			generateObjectFn,
		});

		await generation.generate({ diff: sampleDiff, docFile: sampleDocFile });

		expect(modelCalls).toEqual(["openai/gpt-5"]);
	});

	it("logs and rethrows errors from the AI call", async () => {
		const generateObjectFn = vi.fn(async (): Promise<never> => {
			throw { statusCode: 503, message: "service unavailable" };
		});

		const { logger, entries } = createLoggerCollector();
		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			logger,
		});

		await expect(
			generation.generate({ diff: sampleDiff, docFile: sampleDocFile }),
		).rejects.toEqual({ statusCode: 503, message: "service unavailable" });

		expect(entries.some((e) => e.message === "ai.generate.error")).toBe(true);
		// Sensitive error details must not appear in logs
		expect(JSON.stringify(entries)).not.toContain("service unavailable");
	});

	it("integration: produces a reasonable doc update from sample input", async () => {
		// Simulates end-to-end flow with a realistic AI response
		const realisticUpdatedContent = `# Users API

## getUser

Fetch a user by ID.

\`\`\`ts
getUser(id: string): Promise<User>
\`\`\`

## deleteUser

Delete a user by ID. This operation is irreversible.

\`\`\`ts
deleteUser(id: string): Promise<void>
\`\`\`
`;

		const generateObjectFn = vi.fn(async () => ({
			object: {
				updatedContent: realisticUpdatedContent,
				changeDescription:
					"Added documentation for the new deleteUser function introduced in the diff.",
			},
			usage: { inputTokens: 350, outputTokens: 120, totalTokens: 470 },
		}));

		const generation = createDocGeneration({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await generation.generate({
			diff: sampleDiff,
			docFile: sampleDocFile,
			frameworkConventions: "Use YAML frontmatter with title and description fields.",
		});

		expect(result.skipped).toBe(false);
		expect(result.updatedContent).toContain("deleteUser");
		expect(result.changeDescription).toMatch(/deleteUser/i);
		expect(result.tokenUsage).toEqual({ prompt: 350, completion: 120, total: 470 });
		expect(result.updatedContent.endsWith("\n")).toBe(true);
		expect(result.updatedContent).not.toContain("\r");
	});
});
