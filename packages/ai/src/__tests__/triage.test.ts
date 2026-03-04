import { describe, expect, it, vi } from "vitest";
import { type DocTriageRequest, createDocTriage } from "../triage.js";
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

const sampleDocTree = [
	"docs/api/users.md",
	"docs/api/authentication.md",
	"docs/getting-started.md",
	"docs/configuration.md",
];

describe("createDocTriage", () => {
	it("returns triage result with token usage when AI identifies a documentation need", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				needsUpdate: true,
				confidence: 0.9,
				affectedDocFiles: ["docs/api/users.md"],
				reasoning: "A new deleteUser API was added which should be documented.",
			},
			usage: { inputTokens: 120, outputTokens: 45, totalTokens: 165 },
		}));

		const { logger, entries } = createLoggerCollector();
		const triage = createDocTriage({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			logger,
		});

		const request: DocTriageRequest = {
			diff: sampleDiff,
			docFileTree: sampleDocTree,
		};

		const result = await triage.triage(request);

		expect(result.output.needsUpdate).toBe(true);
		expect(result.output.confidence).toBe(0.9);
		expect(result.output.affectedDocFiles).toEqual(["docs/api/users.md"]);
		expect(result.output.reasoning).toBe(
			"A new deleteUser API was added which should be documented.",
		);
		expect(result.skipped).toBe(false);
		expect(result.tokenUsage).toEqual({ prompt: 120, completion: 45, total: 165 });

		// Verify diff and file tree appear in the prompt
		const callArg = generateObjectFn.mock.calls[0][0];
		expect(callArg.prompt).toContain(sampleDiff);
		expect(callArg.prompt).toContain("docs/api/users.md");
		expect(callArg.system).toContain("documentation reviewer");

		// Verify request and response are logged
		expect(entries.some((e) => e.message === "ai.triage.request")).toBe(true);
		expect(entries.some((e) => e.message === "ai.triage.response")).toBe(true);
	});

	it("marks result as skipped when AI confidence is below the configured threshold", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				needsUpdate: true,
				confidence: 0.5,
				affectedDocFiles: ["docs/api/users.md"],
				reasoning: "Uncertain whether this change requires documentation.",
			},
			usage: { inputTokens: 80, outputTokens: 30, totalTokens: 110 },
		}));

		const triage = createDocTriage({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			confidenceThreshold: 0.7,
		});

		const result = await triage.triage({ diff: sampleDiff, docFileTree: sampleDocTree });

		expect(result.skipped).toBe(true);
		expect(result.output.confidence).toBe(0.5);
	});

	it("does not skip when confidence exactly meets the threshold", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				needsUpdate: true,
				confidence: 0.7,
				affectedDocFiles: [],
				reasoning: "Threshold met.",
			},
			usage: undefined,
		}));

		const triage = createDocTriage({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await triage.triage({ diff: "minor change", docFileTree: [] });

		expect(result.skipped).toBe(false);
	});

	it("applies default confidence threshold of 0.7", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				needsUpdate: true,
				confidence: 0.69,
				affectedDocFiles: [],
				reasoning: "Marginally uncertain.",
			},
			usage: undefined,
		}));

		const triage = createDocTriage({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await triage.triage({ diff: "change", docFileTree: [] });

		expect(result.skipped).toBe(true);
	});

	it("rejects confidenceThreshold values outside [0, 1] at factory creation", () => {
		const baseOptions = {
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn: vi.fn(),
		};

		expect(() => createDocTriage({ ...baseOptions, confidenceThreshold: -0.1 })).toThrow(
			RangeError,
		);
		expect(() => createDocTriage({ ...baseOptions, confidenceThreshold: 1.1 })).toThrow(RangeError);
		expect(() => createDocTriage({ ...baseOptions, confidenceThreshold: 0 })).not.toThrow();
		expect(() => createDocTriage({ ...baseOptions, confidenceThreshold: 1 })).not.toThrow();
	});

	it("logs and rethrows errors from the AI call", async () => {
		const generateObjectFn = vi.fn(async (): Promise<never> => {
			throw { statusCode: 503, message: "service unavailable" };
		});

		const { logger, entries } = createLoggerCollector();
		const triage = createDocTriage({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
			logger,
		});

		await expect(triage.triage({ diff: sampleDiff, docFileTree: sampleDocTree })).rejects.toEqual({
			statusCode: 503,
			message: "service unavailable",
		});

		expect(entries.some((e) => e.message === "ai.triage.error")).toBe(true);
		// Sensitive error details must not appear in logs
		expect(JSON.stringify(entries)).not.toContain("service unavailable");
	});

	it("includes framework conventions and custom instructions in the user prompt when provided", async () => {
		const generateObjectFn = vi.fn(async () => ({
			object: {
				needsUpdate: false,
				confidence: 0.95,
				affectedDocFiles: [],
				reasoning: "No user-facing changes.",
			},
			usage: undefined,
		}));

		const triage = createDocTriage({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		await triage.triage({
			diff: sampleDiff,
			docFileTree: sampleDocTree,
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
				needsUpdate: false,
				confidence: 0.8,
				affectedDocFiles: [],
				reasoning: "No changes required.",
			},
			usage: undefined,
		}));

		const triage = createDocTriage({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateObjectFn,
		});

		const result = await triage.triage({ diff: "short diff", docFileTree: [] });

		expect(result.tokenUsage.prompt).toBeGreaterThan(0);
		expect(result.tokenUsage.completion).toBe(0);
		expect(result.tokenUsage.total).toBe(result.tokenUsage.prompt);
	});

	it("uses the triage model from the configured model selection", async () => {
		const modelCalls: string[] = [];
		const generateObjectFn = vi.fn(async () => ({
			object: {
				needsUpdate: false,
				confidence: 0.9,
				affectedDocFiles: [],
				reasoning: "No changes required.",
			},
			usage: undefined,
		}));

		const triage = createDocTriage({
			apiKey: "sk-test",
			models: { triage: "openai/gpt-5-mini" },
			providerFactory: () => (modelId: string) => {
				modelCalls.push(modelId);
				return modelId;
			},
			generateObjectFn,
		});

		await triage.triage({ diff: "change", docFileTree: [] });

		expect(modelCalls).toEqual(["openai/gpt-5-mini"]);
	});
});
