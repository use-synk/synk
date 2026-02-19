import {
	ANALYZE_CHANGES_COALESCE_WINDOW_MS,
	ANALYZE_CHANGES_JOB_ATTEMPTS,
	ANALYZE_CHANGES_JOB_BACKOFF_TYPE,
	ANALYZE_CHANGES_QUEUE_NAME,
	buildAnalyzeChangesActiveJobId,
	buildAnalyzeChangesPendingPayloadKey,
	type AnalyzeChangesJobPayload,
} from "@synk-ai/shared";
import { describe, expect, it, vi } from "vitest";

const { MockQueue } = vi.hoisted(() => {
	const MockQueue = vi.fn();
	return { MockQueue };
});

vi.mock("bullmq", () => ({ Queue: MockQueue }));

const { createAnalyzeChangesEnqueuer, createAnalyzeChangesQueue } = await import(
	"../queues/analyze-changes.js"
);

const payload: AnalyzeChangesJobPayload = {
	installationId: "installation-1",
	repositoryId: "repository-1",
	trigger: {
		type: "push",
		ref: "refs/heads/main",
		commitSha: "abc123",
	},
};

const makeDb = (hasRun: boolean) => ({
	analysisRun: {
		findFirst: vi.fn(async () => (hasRun ? { id: "run-1" } : null)),
	},
});

const makeQueue = (activeJobExists: boolean) => {
	const set = vi.fn(async () => "OK");
	const remove = vi.fn(async () => undefined);
	const getState = vi.fn(async () => (activeJobExists ? "active" : "missing"));
	const queue = {
		getJob: vi.fn(async () =>
			activeJobExists
				? {
						id: "active-job",
						getState,
						remove,
					}
				: null,
		),
		add: vi.fn(async () => ({ id: "job-1" })),
		client: Promise.resolve({
			set,
		}),
	};
	return { queue, set, getState, remove };
};

describe("createAnalyzeChangesQueue", () => {
	it("configures Redis connection and job retention defaults", () => {
		createAnalyzeChangesQueue("redis://redis.internal:6379/5");

		expect(MockQueue).toHaveBeenCalledOnce();
		expect(MockQueue).toHaveBeenCalledWith(ANALYZE_CHANGES_QUEUE_NAME, {
			connection: { url: "redis://redis.internal:6379/5" },
			defaultJobOptions: {
				removeOnComplete: { count: 1000 },
				removeOnFail: { age: 86400 },
				attempts: ANALYZE_CHANGES_JOB_ATTEMPTS,
				backoff: {
					type: ANALYZE_CHANGES_JOB_BACKOFF_TYPE,
				},
			},
		});
	});
});

describe("createAnalyzeChangesEnqueuer", () => {
	it("skips enqueueing when an analysis run already exists for repository and commit sha", async () => {
		const db = makeDb(true);
		const { queue, set } = makeQueue(false);
		const enqueue = createAnalyzeChangesEnqueuer(queue as never, db);

		await enqueue(payload);

		expect(db.analysisRun.findFirst).toHaveBeenCalledOnce();
		expect(queue.getJob).not.toHaveBeenCalled();
		expect(queue.add).not.toHaveBeenCalled();
		expect(set).not.toHaveBeenCalled();
	});

	it("enqueues an active repository job when no active job exists", async () => {
		const db = makeDb(false);
		const { queue, set } = makeQueue(false);
		const enqueue = createAnalyzeChangesEnqueuer(queue as never, db);

		await enqueue(payload);

		expect(queue.getJob).toHaveBeenCalledWith(buildAnalyzeChangesActiveJobId(payload.repositoryId));
		expect(queue.add).toHaveBeenCalledWith(ANALYZE_CHANGES_QUEUE_NAME, payload, {
			jobId: buildAnalyzeChangesActiveJobId(payload.repositoryId),
			delay: ANALYZE_CHANGES_COALESCE_WINDOW_MS,
			removeOnComplete: true,
			removeOnFail: true,
		});
		expect(set).toHaveBeenCalledOnce();
	});

	it("stores only pending payload when an active repository job already exists", async () => {
		const db = makeDb(false);
		const { queue, set } = makeQueue(true);
		const enqueue = createAnalyzeChangesEnqueuer(queue as never, db);

		await enqueue(payload);

		expect(queue.add).not.toHaveBeenCalled();
		expect(set).toHaveBeenCalledWith(
			buildAnalyzeChangesPendingPayloadKey(payload.repositoryId),
			expect.any(String),
			"PX",
			ANALYZE_CHANGES_COALESCE_WINDOW_MS * 20,
		);
	});

	it("removes terminal fixed-id jobs before enqueueing a new repository run", async () => {
		const db = makeDb(false);
		const set = vi.fn(async () => "OK");
		const remove = vi.fn(async () => undefined);
		const getState = vi.fn(async () => "completed");
		const queue = {
			getJob: vi.fn(async () => ({ id: "completed-job", getState, remove })),
			add: vi.fn(async () => ({ id: "job-2" })),
			client: Promise.resolve({ set }),
		};
		const enqueue = createAnalyzeChangesEnqueuer(queue as never, db);

		await enqueue(payload);

		expect(getState).toHaveBeenCalledOnce();
		expect(remove).toHaveBeenCalledOnce();
		expect(queue.add).toHaveBeenCalledOnce();
	});
});
