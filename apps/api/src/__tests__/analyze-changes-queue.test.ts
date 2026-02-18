import { describe, expect, it, vi } from "vitest";

const { MockQueue } = vi.hoisted(() => {
	const MockQueue = vi.fn();
	return { MockQueue };
});

vi.mock("bullmq", () => ({ Queue: MockQueue }));

const { ANALYZE_CHANGES_QUEUE_NAME, createAnalyzeChangesQueue } = await import(
	"../queues/analyze-changes.js"
);

describe("createAnalyzeChangesQueue", () => {
	it("configures Redis connection and job retention defaults", () => {
		createAnalyzeChangesQueue("redis://redis.internal:6379/5");

		expect(MockQueue).toHaveBeenCalledOnce();
		expect(MockQueue).toHaveBeenCalledWith(ANALYZE_CHANGES_QUEUE_NAME, {
			connection: { url: "redis://redis.internal:6379/5" },
			defaultJobOptions: {
				removeOnComplete: { count: 1000 },
				removeOnFail: { age: 86400 },
			},
		});
	});
});
