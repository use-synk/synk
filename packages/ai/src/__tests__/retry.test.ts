import { describe, expect, it, vi } from "vitest";
import {
	DEFAULT_RETRY_OPTIONS,
	getErrorStatusCode,
	isTransientError,
	validateRetryOptions,
	withExponentialBackoff,
} from "../retry.js";

describe("retry helpers", () => {
	it("extracts status code from known error shapes", () => {
		expect(getErrorStatusCode({ statusCode: 429 })).toBe(429);
		expect(getErrorStatusCode({ status: 503 })).toBe(503);
		expect(getErrorStatusCode(new Error("boom"))).toBeUndefined();
	});

	it("recognizes transient errors", () => {
		expect(isTransientError({ statusCode: 429 })).toBe(true);
		expect(isTransientError({ status: 500 })).toBe(true);
		expect(isTransientError({ statusCode: 502 })).toBe(true);
		expect(isTransientError({ status: 504 })).toBe(true);
		expect(isTransientError({ statusCode: 404 })).toBe(false);
	});

	it("retries transient errors with exponential backoff", async () => {
		const sleep = vi.fn(async (_delayMs: number): Promise<void> => {});
		const onRetry = vi.fn();
		let attempts = 0;

		const result = await withExponentialBackoff(
			async (): Promise<string> => {
				attempts += 1;
				if (attempts < 3) {
					throw { statusCode: 429 };
				}
				return "ok";
			},
			{
				...DEFAULT_RETRY_OPTIONS,
				sleep,
				initialDelayMs: 10,
				maxDelayMs: 100,
				backoffMultiplier: 2,
				maxAttempts: 3,
			},
			onRetry,
		);

		expect(result).toBe("ok");
		expect(attempts).toBe(3);
		expect(sleep).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenNthCalledWith(1, 10);
		expect(sleep).toHaveBeenNthCalledWith(2, 20);
		expect(onRetry).toHaveBeenCalledTimes(2);
	});

	it("does not retry non-transient failures", async () => {
		const onRetry = vi.fn();
		await expect(
			withExponentialBackoff(
				async (): Promise<never> => {
					throw { statusCode: 401 };
				},
				DEFAULT_RETRY_OPTIONS,
				onRetry,
			),
		).rejects.toEqual({ statusCode: 401 });
		expect(onRetry).not.toHaveBeenCalled();
	});

	it("validates retry options", () => {
		expect(() =>
			validateRetryOptions({
				...DEFAULT_RETRY_OPTIONS,
				maxAttempts: 0,
			}),
		).toThrow(RangeError);
		expect(() =>
			validateRetryOptions({
				...DEFAULT_RETRY_OPTIONS,
				initialDelayMs: -1,
			}),
		).toThrow(RangeError);
		expect(() =>
			validateRetryOptions({
				...DEFAULT_RETRY_OPTIONS,
				maxDelayMs: 10,
				initialDelayMs: 20,
			}),
		).toThrow(RangeError);
	});
});
