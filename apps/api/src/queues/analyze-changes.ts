import {
	ANALYZE_CHANGES_COALESCE_WINDOW_MS,
	ANALYZE_CHANGES_JOB_ATTEMPTS,
	ANALYZE_CHANGES_JOB_BACKOFF_TYPE,
	ANALYZE_CHANGES_QUEUE_NAME,
	buildAnalyzeChangesActiveJobId,
	buildAnalyzeChangesPendingPayloadKey,
	getRepositoryActiveJob,
	isAlreadyExistingJobError,
	type PendingAnalyzeChangesPayload,
	type AnalyzeChangesJobPayload,
} from "@synk-ai/shared";
import { Queue } from "bullmq";

export { ANALYZE_CHANGES_QUEUE_NAME };

const REMOVE_COMPLETED_JOBS = { count: 1000 } as const;
const REMOVE_FAILED_JOBS = { age: 24 * 60 * 60 } as const;
const ACTIVE_JOB_START_DELAY_MS = ANALYZE_CHANGES_COALESCE_WINDOW_MS;

export type AnalyzeChangesEnqueuer = (payload: AnalyzeChangesJobPayload) => Promise<void>;
type AnalyzeChangesQueueDatabase = {
	analysisRun: {
		findFirst(args: {
			where: {
				repositoryId: string;
				triggerCommitSha: string;
			};
			select: {
				id: true;
			};
		}): Promise<{ id: string } | null>;
	};
};

const serializePendingPayload = (value: PendingAnalyzeChangesPayload): string =>
	JSON.stringify(value);

const hasExistingRunForCommit = async (
	db: AnalyzeChangesQueueDatabase,
	payload: AnalyzeChangesJobPayload,
): Promise<boolean> => {
	const existingRun = await db.analysisRun.findFirst({
		where: {
			repositoryId: payload.repositoryId,
			triggerCommitSha: payload.trigger.commitSha,
		},
		select: {
			id: true,
		},
	});
	return existingRun !== null;
};

const setPendingPayload = async (
	queue: Queue<AnalyzeChangesJobPayload>,
	payload: AnalyzeChangesJobPayload,
): Promise<void> => {
	const pendingKey = buildAnalyzeChangesPendingPayloadKey(payload.repositoryId);
	const redisClient = await queue.client;
	const pending: PendingAnalyzeChangesPayload = {
		payload,
		updatedAtMs: Date.now(),
	};
	await redisClient.set(
		pendingKey,
		serializePendingPayload(pending),
		"PX",
		ANALYZE_CHANGES_COALESCE_WINDOW_MS * 20,
	);
};

export const createAnalyzeChangesQueue = (redisUrl: string): Queue<AnalyzeChangesJobPayload> =>
	new Queue<AnalyzeChangesJobPayload>(ANALYZE_CHANGES_QUEUE_NAME, {
		connection: { url: redisUrl },
		defaultJobOptions: {
			removeOnComplete: REMOVE_COMPLETED_JOBS,
			removeOnFail: REMOVE_FAILED_JOBS,
			attempts: ANALYZE_CHANGES_JOB_ATTEMPTS,
			backoff: {
				type: ANALYZE_CHANGES_JOB_BACKOFF_TYPE,
			},
		},
	});

export const createAnalyzeChangesEnqueuer = (
	queue: Queue<AnalyzeChangesJobPayload>,
	db: AnalyzeChangesQueueDatabase,
): AnalyzeChangesEnqueuer => {
	return async (payload) => {
		if (await hasExistingRunForCommit(db, payload)) {
			return;
		}

		const activeJobId = buildAnalyzeChangesActiveJobId(payload.repositoryId);
		const activeJob = await getRepositoryActiveJob(queue, payload.repositoryId);
		if (activeJob !== null) {
			await setPendingPayload(queue, payload);
			return;
		}

		await setPendingPayload(queue, payload);

		try {
			await queue.add(ANALYZE_CHANGES_QUEUE_NAME, payload, {
				jobId: activeJobId,
				delay: ACTIVE_JOB_START_DELAY_MS,
				removeOnComplete: true,
				removeOnFail: true,
			});
		} catch (error) {
			if (!isAlreadyExistingJobError(error)) {
				throw error;
			}

				const jobAfterConflict = await getRepositoryActiveJob(queue, payload.repositoryId);
				if (jobAfterConflict !== null) {
					return;
				}

				try {
					await queue.add(ANALYZE_CHANGES_QUEUE_NAME, payload, {
						jobId: activeJobId,
						delay: ACTIVE_JOB_START_DELAY_MS,
						removeOnComplete: true,
						removeOnFail: true,
					});
				} catch (retryError) {
					if (!isAlreadyExistingJobError(retryError)) {
						throw retryError;
					}
				}
			}
		};
	};
