import { describe, expect, it } from "bun:test";
import { classifyError } from "../jobs/error-classification";

const makeHttpError = (status: number): Error =>
	Object.assign(new Error(`HTTP ${status}`), { status });

// ---------------------------------------------------------------------------
// Non-retryable HTTP statuses
// ---------------------------------------------------------------------------

describe("classifyError — non-retryable HTTP errors", () => {
	it.each([400, 401, 403, 404, 409, 410, 422])(
		"classifies HTTP %i (4xx client error) as non-retryable",
		(status) => {
			expect(classifyError(makeHttpError(status))).toBe("non-retryable");
		},
	);

	it("classifies a plain object with status 401 as non-retryable", () => {
		expect(classifyError({ status: 401 })).toBe("non-retryable");
	});

	it("classifies a plain object with status 404 as non-retryable", () => {
		expect(classifyError({ status: 404 })).toBe("non-retryable");
	});
});

// ---------------------------------------------------------------------------
// Retryable HTTP statuses
// ---------------------------------------------------------------------------

describe("classifyError — retryable HTTP errors", () => {
	it("classifies HTTP 429 (rate limit) as retryable", () => {
		expect(classifyError(makeHttpError(429))).toBe("retryable");
	});

	it.each([500, 502, 503, 504, 599])(
		"classifies HTTP %i (server error) as retryable",
		(status) => {
			expect(classifyError(makeHttpError(status))).toBe("retryable");
		},
	);
});

// ---------------------------------------------------------------------------
// Non-HTTP and unknown errors default to retryable
// ---------------------------------------------------------------------------

describe("classifyError — non-HTTP errors are retryable", () => {
	it("classifies a plain Error (no status) as retryable", () => {
		expect(classifyError(new Error("connection refused"))).toBe("retryable");
	});

	it("classifies a string as retryable", () => {
		expect(classifyError("something went wrong")).toBe("retryable");
	});

	it("classifies null as retryable", () => {
		expect(classifyError(null)).toBe("retryable");
	});

	it("classifies undefined as retryable", () => {
		expect(classifyError(undefined)).toBe("retryable");
	});

	it("classifies an object without a numeric status as retryable", () => {
		expect(classifyError({ message: "no status field" })).toBe("retryable");
	});

	it("classifies an object with a non-integer status as retryable", () => {
		expect(classifyError({ status: "404" })).toBe("retryable");
	});
});
