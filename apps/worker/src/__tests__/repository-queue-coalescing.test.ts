import {
	ANALYZE_CHANGES_COALESCE_WINDOW_MS,
	buildAnalyzeChangesActiveJobId,
	calculateCoalesceDelayMs,
	getRepositoryActiveJob,
	isAlreadyExistingJobError,
	parsePendingPayloadRecord,
	type AnalyzeChangesJobPayload,
} from "@synk-ai/shared";
import { describe, expect, it, vi } from "vitest";

const payload: AnalyzeChangesJobPayload = {
	installationId: "installation-1",
	repositoryId: "repository-1",
	trigger: {
		type: "push",
		ref: "refs/heads/main",
		commitSha: "abc123",
	},
};

describe("parsePendingPayloadRecord", () => {
	it("returns null for invalid payload records", () => {
		expect(parsePendingPayloadRecord(null)).toBeNull();
		expect(parsePendingPayloadRecord("not-json")).toBeNull();
		expect(parsePendingPayloadRecord(JSON.stringify({ payload: {}, updatedAtMs: 1 }))).toBeNull();
	});

	it("returns a parsed payload for valid records", () => {
		const value = parsePendingPayloadRecord(
			JSON.stringify({
				payload,
				updatedAtMs: 1_234,
			}),
		);

		expect(value).toEqual({
			payload,
			updatedAtMs: 1_234,
		});
	});
});

describe("getRepositoryActiveJob", () => {
	it("returns null and removes completed fixed-id jobs", async () => {
		const remove = vi.fn(async () => undefined);
		const getState = vi.fn(async () => "completed");
		const queue = {
			getJob: vi.fn(async () => ({
				getState,
				remove,
			})),
		};

		const job = await getRepositoryActiveJob(queue, payload.repositoryId);

		expect(queue.getJob).toHaveBeenCalledWith(buildAnalyzeChangesActiveJobId(payload.repositoryId));
		expect(getState).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledOnce();
		expect(job).toBeNull();
	});

	it("returns non-terminal jobs without removal", async () => {
		const remove = vi.fn(async () => undefined);
		const activeJob = {
			getState: vi.fn(async () => "active"),
			remove,
		};
		const queue = {
			getJob: vi.fn(async () => activeJob),
		};

		const job = await getRepositoryActiveJob(queue, payload.repositoryId);

		expect(job).toBe(activeJob);
		expect(remove).not.toHaveBeenCalled();
	});
});

describe("calculateCoalesceDelayMs", () => {
	it("returns remaining window duration for fresh updates", () => {
		const nowMs = 10_000;
		expect(calculateCoalesceDelayMs(nowMs - 2_000, nowMs)).toBe(
			ANALYZE_CHANGES_COALESCE_WINDOW_MS - 2_000,
		);
	});

	it("returns zero when the coalescing window has elapsed", () => {
		const nowMs = 50_000;
		expect(calculateCoalesceDelayMs(nowMs - ANALYZE_CHANGES_COALESCE_WINDOW_MS, nowMs)).toBe(0);
		expect(calculateCoalesceDelayMs(nowMs - ANALYZE_CHANGES_COALESCE_WINDOW_MS - 1, nowMs)).toBe(0);
	});

	it("clamps negative elapsed time to avoid delay larger than window", () => {
		const nowMs = 10_000;
		expect(calculateCoalesceDelayMs(nowMs + 1_000, nowMs)).toBe(
			ANALYZE_CHANGES_COALESCE_WINDOW_MS,
		);
	});
});

describe("isAlreadyExistingJobError", () => {
	it("detects duplicate BullMQ add errors", () => {
		expect(isAlreadyExistingJobError(new Error("Job already exists"))).toBe(true);
		expect(isAlreadyExistingJobError(new Error("different error"))).toBe(false);
		expect(isAlreadyExistingJobError("not-error")).toBe(false);
	});
});
