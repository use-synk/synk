import {
	ANALYZE_CHANGES_COALESCE_WINDOW_MS,
	ANALYZE_CHANGES_JOB_ATTEMPTS,
	ANALYZE_CHANGES_JOB_BACKOFF_TYPE,
	ANALYZE_CHANGES_QUEUE_NAME,
	type AnalyzeChangesJobPayload,
	type PendingAnalyzeChangesPayload,
	buildAnalyzeChangesActiveJobId,
	buildAnalyzeChangesPendingPayloadKey,
	getRepositoryActiveJob,
	isAlreadyExistingJobError,
} from "@synk-ai/shared";
import { Queue } from "bullmq";
import type { Logger } from "../logger";

export { ANALYZE_CHANGES_QUEUE_NAME };

const REMOVE_COMPLETED_JOBS = { count: 1000 } as const;
const REMOVE_FAILED_JOBS = { age: 24 * 60 * 60 } as const;
const ACTIVE_JOB_START_DELAY_MS = ANALYZE_CHANGES_COALESCE_WINDOW_MS;
const toBullMqSafeJobId = (value: string): string => value.replaceAll(":", "__");

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
	logger?: Logger,
): AnalyzeChangesEnqueuer => {
	return async (payload) => {
		const logContext = {
			repositoryId: payload.repositoryId,
			installationId: payload.installationId,
			triggerType: payload.trigger.type,
			commitSha: payload.trigger.commitSha,
			ref: payload.trigger.ref,
			prNumber: payload.trigger.type === "merge" ? payload.trigger.prNumber : undefined,
		};
		logger?.info(logContext, "analyze-changes enqueue requested");

		if (await hasExistingRunForCommit(db, payload)) {
			logger?.info(logContext, "analyze-changes enqueue skipped: run for commit already exists");
			return;
		}

		const activeJobId = toBullMqSafeJobId(buildAnalyzeChangesActiveJobId(payload.repositoryId));
		const activeJob = await getRepositoryActiveJob(queue, payload.repositoryId);
		if (activeJob !== null) {
			await setPendingPayload(queue, payload);
			logger?.info(
				{
					...logContext,
					activeJobId,
				},
				"analyze-changes enqueue coalesced into pending payload (active job exists)",
			);
			return;
		}

		await setPendingPayload(queue, payload);
		logger?.debug(
			{
				...logContext,
				activeJobId,
				delayMs: ACTIVE_JOB_START_DELAY_MS,
			},
			"analyze-changes pending payload stored",
		);

		try {
			await queue.add(ANALYZE_CHANGES_QUEUE_NAME, payload, {
				jobId: activeJobId,
				delay: ACTIVE_JOB_START_DELAY_MS,
				removeOnComplete: true,
				removeOnFail: true,
			});
			logger?.info(
				{
					...logContext,
					jobId: activeJobId,
					delayMs: ACTIVE_JOB_START_DELAY_MS,
				},
				"analyze-changes job enqueued",
			);
		} catch (error) {
			if (!isAlreadyExistingJobError(error)) {
				logger?.error(
					{ err: error, ...logContext, jobId: activeJobId },
					"enqueue failed unexpectedly",
				);
				throw error;
			}
			logger?.warn(
				{
					...logContext,
					jobId: activeJobId,
				},
				"enqueue conflict: active job id already exists, checking active state",
			);

			const jobAfterConflict = await getRepositoryActiveJob(queue, payload.repositoryId);
			if (jobAfterConflict !== null) {
				logger?.info(
					{
						...logContext,
						jobId: activeJobId,
					},
					"enqueue conflict resolved: active job still exists, payload left pending",
				);
				return;
			}

			try {
				await queue.add(ANALYZE_CHANGES_QUEUE_NAME, payload, {
					jobId: activeJobId,
					delay: ACTIVE_JOB_START_DELAY_MS,
					removeOnComplete: true,
					removeOnFail: true,
				});
				logger?.info(
					{
						...logContext,
						jobId: activeJobId,
						delayMs: ACTIVE_JOB_START_DELAY_MS,
					},
					"analyze-changes job enqueued after conflict retry",
				);
			} catch (retryError) {
				if (!isAlreadyExistingJobError(retryError)) {
					logger?.error(
						{
							err: retryError,
							...logContext,
							jobId: activeJobId,
						},
						"enqueue retry failed unexpectedly",
					);
					throw retryError;
				}
				logger?.warn(
					{
						...logContext,
						jobId: activeJobId,
					},
					"enqueue retry skipped: job id still exists",
				);
			}
		}
	};
};
