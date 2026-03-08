export const ANALYZE_CHANGES_QUEUE_NAME = "analyze-changes";
export const ANALYZE_CHANGES_DLQ_NAME = "analyze-changes-dlq";
export const ANALYZE_CHANGES_COALESCE_WINDOW_MS = 30_000;

/**
 * Custom BullMQ backoff strategy name for analyze-changes jobs.
 * The strategy is registered on the Worker; job options must reference this name.
 */
export const ANALYZE_CHANGES_JOB_BACKOFF_TYPE = "synk-exponential";

/**
 * Total number of attempts (1 initial + 3 retries) for analyze-changes jobs.
 * Retry delays: 30 s → 2 min → 10 min.
 */
export const ANALYZE_CHANGES_JOB_ATTEMPTS = 4;

export type AnalyzeChangesJobPayload = {
	installationId: string;
	repositoryId: string;
	trigger: {
		type: "push" | "merge" | "manual";
		ref: string;
		commitSha: string;
		prNumber?: number;
		prTitle?: string;
		sourceBranch?: string;
		targetBranch?: string;
		prAuthorName?: string;
		prAuthorUsername?: string;
		prAuthorAvatarUrl?: string;
	};
};

export const buildAnalyzeChangesActiveJobId = (repositoryId: string): string =>
	`${ANALYZE_CHANGES_QUEUE_NAME}__repo__${repositoryId}__active`;

export const buildAnalyzeChangesPendingPayloadKey = (repositoryId: string): string =>
	`${ANALYZE_CHANGES_QUEUE_NAME}:repo:${repositoryId}:pending`;
