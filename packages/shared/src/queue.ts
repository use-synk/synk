export const ANALYZE_CHANGES_QUEUE_NAME = "analyze-changes";
export const ANALYZE_CHANGES_DLQ_NAME = "analyze-changes-dlq";

/**
 * Custom BullMQ backoff strategy name for analyze-changes jobs.
 * The strategy is registered on the Worker; job options must reference this name.
 */
export const ANALYZE_CHANGES_JOB_BACKOFF_TYPE = "synk-exponential";

/**
 * Total number of attempts (1 initial + 2 retries) for analyze-changes jobs.
 * Retry delays: 30 s → 2 min → (job exhausted).
 */
export const ANALYZE_CHANGES_JOB_ATTEMPTS = 3;

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
