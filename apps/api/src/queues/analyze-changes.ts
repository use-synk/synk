import { ANALYZE_CHANGES_QUEUE_NAME, type AnalyzeChangesJobPayload } from "@synk-ai/shared";
import { Queue } from "bullmq";

export { ANALYZE_CHANGES_QUEUE_NAME };

const REMOVE_COMPLETED_JOBS = { count: 1000 } as const;
const REMOVE_FAILED_JOBS = { age: 24 * 60 * 60 } as const;

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
