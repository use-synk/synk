import { Queue } from "bullmq";

export const ANALYZE_CHANGES_QUEUE_NAME = "analyze-changes";

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
	});

export const createAnalyzeChangesEnqueuer = (
	queue: Queue<AnalyzeChangesJobPayload>,
): AnalyzeChangesEnqueuer => {
	return async (payload) => {
		await queue.add(ANALYZE_CHANGES_QUEUE_NAME, payload);
	};
};
