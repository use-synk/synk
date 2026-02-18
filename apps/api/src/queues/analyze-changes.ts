import { Queue } from "bullmq";

export const ANALYZE_CHANGES_QUEUE_NAME = "analyze-changes";
const REMOVE_COMPLETED_JOBS = { count: 1000 } as const;
const REMOVE_FAILED_JOBS = { age: 24 * 60 * 60 } as const;

export type AnalyzeChangesJobPayload = {
	installationId: string;
	repositoryId: string;
	trigger: {
		type: "push" | "merge";
		ref: string;
		commitSha: string;
		prNumber?: number;
	};
};

export type AnalyzeChangesEnqueuer = (payload: AnalyzeChangesJobPayload) => Promise<void>;

export const createAnalyzeChangesQueue = (redisUrl: string): Queue<AnalyzeChangesJobPayload> =>
	new Queue<AnalyzeChangesJobPayload>(ANALYZE_CHANGES_QUEUE_NAME, {
		connection: { url: redisUrl },
		defaultJobOptions: {
			removeOnComplete: REMOVE_COMPLETED_JOBS,
			removeOnFail: REMOVE_FAILED_JOBS,
		},
	});

export const createAnalyzeChangesEnqueuer = (
	queue: Queue<AnalyzeChangesJobPayload>,
): AnalyzeChangesEnqueuer => {
	return async (payload) => {
		await queue.add(ANALYZE_CHANGES_QUEUE_NAME, payload);
	};
};
