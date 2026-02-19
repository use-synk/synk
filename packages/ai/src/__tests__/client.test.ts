import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiClient, createAiClientFromEnvironment } from "../client.js";
import type { AiLogFields, AiLogger } from "../logging.js";

type LogEvent = {
	message: string;
	fields: AiLogFields;
};

const initialOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
const initialNodeEnv = process.env.NODE_ENV;

const restoreEnvironmentVariable = (
	key: "OPENROUTER_API_KEY" | "NODE_ENV",
	value: string | undefined,
): void => {
	if (value === undefined) {
		Reflect.deleteProperty(process.env, key);
		return;
	}
	process.env[key] = value;
};

const createLoggerCollector = (): { logger: AiLogger; entries: LogEvent[] } => {
	const entries: LogEvent[] = [];
	return {
		entries,
		logger: {
			info: (message: string, fields: AiLogFields): void => {
				entries.push({ message, fields });
			},
			warn: (message: string, fields: AiLogFields): void => {
				entries.push({ message, fields });
			},
			error: (message: string, fields: AiLogFields): void => {
				entries.push({ message, fields });
			},
		},
	};
};

afterEach(() => {
	restoreEnvironmentVariable("OPENROUTER_API_KEY", initialOpenRouterApiKey);
	restoreEnvironmentVariable("NODE_ENV", initialNodeEnv);
});

describe("createAiClient", () => {
	it("creates provider with API key and runs request with logical model mapping", async () => {
		const providerCalls: Array<{ apiKey: string; modelId: string }> = [];
		const providerFactory = (options: { apiKey: string }) => {
			return (modelId: string): string => {
				providerCalls.push({ apiKey: options.apiKey, modelId });
				return `model:${modelId}`;
			};
		};
		const generateTextFn = vi.fn(
			async (): Promise<{
				text: string;
				usage: { inputTokens: number; outputTokens: number; totalTokens: number };
			}> => ({
				text: "generated",
				usage: {
					inputTokens: 11,
					outputTokens: 7,
					totalTokens: 18,
				},
			}),
		);
		const { logger, entries } = createLoggerCollector();

		const client = createAiClient({
			apiKey: "sk-test",
			models: { triage: "openai/gpt-5-mini" },
			providerFactory,
			generateTextFn,
			logger,
			retry: {
				maxAttempts: 2,
				sleep: async (): Promise<void> => {},
			},
		});

		const response = await client.generateText({
			purpose: "triage",
			prompt: "do not log this body",
			metadata: { runId: "run-1" },
		});

		expect(response.modelId).toBe("openai/gpt-5-mini");
		expect(response.tokenUsage).toEqual({ prompt: 11, completion: 7, total: 18 });
		expect(providerCalls).toEqual([{ apiKey: "sk-test", modelId: "openai/gpt-5-mini" }]);
		expect(generateTextFn).toHaveBeenCalledTimes(1);

		const serialized = JSON.stringify(entries);
		expect(serialized).not.toContain("do not log this body");
		expect(entries.some((entry) => entry.message === "ai.request")).toBe(true);
		expect(entries.some((entry) => entry.message === "ai.response")).toBe(true);
	});

	it("retries transient failures and succeeds", async () => {
		let attempts = 0;
		const sleepCalls: number[] = [];
		const generateTextFn = vi.fn(async (): Promise<{ text: string }> => {
			attempts += 1;
			if (attempts < 3) {
				throw { statusCode: 503 };
			}
			return { text: "ok" };
		});
		const { logger, entries } = createLoggerCollector();

		const client = createAiClient({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateTextFn,
			logger,
			retry: {
				maxAttempts: 3,
				initialDelayMs: 5,
				sleep: async (delayMs: number): Promise<void> => {
					sleepCalls.push(delayMs);
				},
			},
		});

		const response = await client.generateText({
			purpose: "generate",
			prompt: "abcde",
		});

		expect(response.text).toBe("ok");
		expect(attempts).toBe(3);
		expect(sleepCalls).toEqual([5, 10]);
		expect(entries.filter((entry) => entry.message === "ai.retry")).toHaveLength(2);
	});

	it("logs and rethrows non-retryable failures", async () => {
		const generateTextFn = vi.fn(async (): Promise<never> => {
			throw { statusCode: 400, message: "bad request" };
		});
		const { logger, entries } = createLoggerCollector();

		const client = createAiClient({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateTextFn,
			logger,
			retry: {
				maxAttempts: 3,
				sleep: async (): Promise<void> => {},
			},
		});

		await expect(
			client.generateText({
				purpose: "triage",
				prompt: "input",
			}),
		).rejects.toEqual({ statusCode: 400, message: "bad request" });

		expect(entries.some((entry) => entry.message === "ai.error")).toBe(true);
		expect(JSON.stringify(entries)).not.toContain("bad request");
	});

	it("rejects invalid maxRetries values", async () => {
		const client = createAiClient({
			apiKey: "sk-test",
			providerFactory: () => () => "model",
			generateTextFn: async (): Promise<{ text: string }> => ({ text: "ok" }),
			retry: {
				maxAttempts: 3,
				sleep: async (): Promise<void> => {},
			},
		});

		await expect(
			client.generateText({
				purpose: "triage",
				prompt: "input",
				maxRetries: -1,
			}),
		).rejects.toBeInstanceOf(RangeError);
	});

	it("rejects invalid retry options at client creation", () => {
		expect(() =>
			createAiClient({
				apiKey: "sk-test",
				providerFactory: () => () => "model",
				generateTextFn: async (): Promise<{ text: string }> => ({ text: "ok" }),
				retry: {
					maxAttempts: 0,
					sleep: async (): Promise<void> => {},
				},
			}),
		).toThrow(RangeError);
	});
});

describe("createAiClientFromEnvironment", () => {
	it("loads OPENROUTER_API_KEY from environment", async () => {
		process.env.OPENROUTER_API_KEY = "sk-env";
		process.env.NODE_ENV = "test";
		const providerCalls: Array<{ apiKey: string; modelId: string }> = [];

		const client = createAiClientFromEnvironment({
			providerFactory: (options: { apiKey: string }) => {
				return (modelId: string): string => {
					providerCalls.push({ apiKey: options.apiKey, modelId });
					return `model:${modelId}`;
				};
			},
			generateTextFn: async (): Promise<{ text: string }> => ({ text: "ok" }),
			retry: {
				maxAttempts: 1,
				sleep: async (): Promise<void> => {},
			},
		});

		await client.generateText({
			purpose: "triage",
			prompt: "ping",
		});

		expect(providerCalls[0]).toEqual({
			apiKey: "sk-env",
			modelId: "anthropic/claude-sonnet-4.5",
		});
	});
});
