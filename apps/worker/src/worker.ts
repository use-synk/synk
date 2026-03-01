import { db } from "@synk-ai/db";
import {
	ANALYZE_CHANGES_COALESCE_WINDOW_MS,
	type AnalyzeChangesJobPayload,
	type PendingAnalyzeChangesPayload,
	buildAnalyzeChangesActiveJobId,
	buildAnalyzeChangesPendingPayloadKey,
	calculateCoalesceDelayMs,
	getRepositoryActiveJob,
	isAlreadyExistingJobError,
	parsePendingPayloadRecord,
} from "@synk-ai/shared";
import { type Job, type JobsOptions, UnrecoverableError } from "bullmq";
import { parseWorkerEnvironment } from "./env";
import { processAnalyzeChangesJob } from "./jobs/analyze-changes";
import { createLogger } from "./logger";
import {
	type AnalyzeChangesDlqPayload,
	createAnalyzeChangesDlqQueue,
	createAnalyzeChangesQueue,
	createAnalyzeChangesQueueEvents,
	createAnalyzeChangesWorker,
	createRedisConnectionOptions,
} from "./queue";

const SHUTDOWN_TIMEOUT_MS = 30_000;
const PENDING_PAYLOAD_TTL_MS = ANALYZE_CHANGES_COALESCE_WINDOW_MS * 20;

const getPendingPayload = async (
	queue: ReturnType<typeof createAnalyzeChangesQueue>,
	job: Job<AnalyzeChangesJobPayload>,
): Promise<PendingAnalyzeChangesPayload | null> => {
	const redisClient = await queue.client;
	const key = buildAnalyzeChangesPendingPayloadKey(job.data.repositoryId);
	return parsePendingPayloadRecord(await redisClient.get(key));
};

const clearPendingPayload = async (
	queue: ReturnType<typeof createAnalyzeChangesQueue>,
	job: Job<AnalyzeChangesJobPayload>,
): Promise<void> => {
	const redisClient = await queue.client;
	const key = buildAnalyzeChangesPendingPayloadKey(job.data.repositoryId);
	await redisClient.del(key);
};

const updatePayloadFromPending = async (
	queue: ReturnType<typeof createAnalyzeChangesQueue>,
	job: Job<AnalyzeChangesJobPayload>,
): Promise<void> => {
	const pending = await getPendingPayload(queue, job);
	if (pending === null) {
		return;
	}
	if (pending.payload.repositoryId !== job.data.repositoryId) {
		return;
	}
	if (pending.payload.trigger.commitSha === job.data.trigger.commitSha) {
		await clearPendingPayload(queue, job);
		return;
	}
	await job.updateData(pending.payload);
	await clearPendingPayload(queue, job);
};

const hasExistingRunForCommit = async (payload: AnalyzeChangesJobPayload): Promise<boolean> => {
	const run = await db.analysisRun.findFirst({
		where: {
			repositoryId: payload.repositoryId,
			triggerCommitSha: payload.trigger.commitSha,
		},
		select: {
			id: true,
		},
	});
	return run !== null;
};

const enqueuePendingPayloadForRepository = async (
	queue: ReturnType<typeof createAnalyzeChangesQueue>,
	job: Job<AnalyzeChangesJobPayload>,
): Promise<void> => {
	const pending = await getPendingPayload(queue, job);
	if (pending === null) {
		return;
	}

	if (await hasExistingRunForCommit(pending.payload)) {
		await clearPendingPayload(queue, job);
		return;
	}

	const delayMs = calculateCoalesceDelayMs(pending.updatedAtMs);

	const activeJob = await getRepositoryActiveJob(queue, job.data.repositoryId);
	if (activeJob !== null) {
		const redisClient = await queue.client;
		const key = buildAnalyzeChangesPendingPayloadKey(job.data.repositoryId);
		await redisClient.pexpire(key, PENDING_PAYLOAD_TTL_MS);
		return;
	}

	const activeJobId = buildAnalyzeChangesActiveJobId(job.data.repositoryId);
	const jobOptions: JobsOptions = {
		jobId: activeJobId,
		delay: delayMs,
		removeOnComplete: true,
		removeOnFail: true,
	};
	if (job.opts.attempts !== undefined) {
		jobOptions.attempts = job.opts.attempts;
	}
	if (job.opts.backoff !== undefined && job.opts.backoff !== 0) {
		jobOptions.backoff = job.opts.backoff as Exclude<
			Job<AnalyzeChangesJobPayload>["opts"]["backoff"],
			undefined
		>;
	}

	try {
		await queue.add(job.name, pending.payload, jobOptions);
		await clearPendingPayload(queue, job);
	} catch (error) {
		if (!isAlreadyExistingJobError(error)) {
			throw error;
		}

		const jobAfterConflict = await getRepositoryActiveJob(queue, job.data.repositoryId);
		if (jobAfterConflict === null) {
			try {
				await queue.add(job.name, pending.payload, jobOptions);
				await clearPendingPayload(queue, job);
				return;
			} catch (retryError) {
				if (!isAlreadyExistingJobError(retryError)) {
					throw retryError;
				}
			}
		}

		const redisClient = await queue.client;
		const key = buildAnalyzeChangesPendingPayloadKey(job.data.repositoryId);
		await redisClient.pexpire(key, PENDING_PAYLOAD_TTL_MS);
	}
};

const isJobPermanentlyFailed = (job: Job<AnalyzeChangesJobPayload>, error: Error): boolean => {
	const maxAttempts = job.opts.attempts ?? 1;
	return job.attemptsMade >= maxAttempts || error instanceof UnrecoverableError;
};

const moveToDlq = async (
	job: Job<AnalyzeChangesJobPayload>,
	error: Error,
	dlqQueue: ReturnType<typeof createAnalyzeChangesDlqQueue>,
): Promise<void> => {
	const payload: AnalyzeChangesDlqPayload = {
		originalJobId: job.id,
		failedAt: new Date().toISOString(),
		errorMessage: error.message,
		attemptsMade: job.attemptsMade,
		data: job.data,
	};
	await dlqQueue.add(job.name, payload);
};

const startWorker = async (): Promise<void> => {
	const env = parseWorkerEnvironment();
	const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
	const connection = createRedisConnectionOptions({ redisUrl: env.REDIS_URL, logger });
	const analyzeChangesQueue = createAnalyzeChangesQueue(connection);

	const worker = createAnalyzeChangesWorker({
		connection,
		concurrency: env.WORKER_CONCURRENCY,
		processor: async (job: Job<AnalyzeChangesJobPayload>) => {
			await updatePayloadFromPending(analyzeChangesQueue, job);
			await processAnalyzeChangesJob(job, logger);
		},
	});
	const queueEvents = createAnalyzeChangesQueueEvents(connection);
	const dlqQueue = createAnalyzeChangesDlqQueue(connection);

	worker.on("error", (error) => {
		logger.error({ err: error }, "worker error");
	});

	queueEvents.on("error", (error) => {
		logger.error({ err: error }, "queue events error");
	});

	dlqQueue.on("error", (error) => {
		logger.error({ err: error }, "dead-letter queue error");
	});

	worker.on("failed", (job, error) => {
		if (!job) {
			logger.error({ err: error }, "job failed (job reference unavailable)");
			return;
		}

		const permanently = isJobPermanentlyFailed(job, error);

		const logMetadata = {
			err: error,
			jobId: job.id ?? "unknown",
			queueName: job.queueName,
			attemptsMade: job.attemptsMade,
			maxAttempts: job.opts.attempts ?? 1,
			repositoryId: job.data.repositoryId,
			isPermanentlyFailed: permanently,
		};

		if (permanently) {
			logger.error(logMetadata, "job permanently failed — moving to dead-letter queue");
			void moveToDlq(job, error, dlqQueue).catch((dlqError) => {
				logger.error(
					{ err: dlqError, jobId: job.id },
					"failed to add permanently failed job to dead-letter queue",
				);
			});
			void enqueuePendingPayloadForRepository(analyzeChangesQueue, job).catch((enqueueError) => {
				logger.error(
					{ err: enqueueError, jobId: job.id, repositoryId: job.data.repositoryId },
					"failed to enqueue pending repository payload after permanent failure",
				);
			});
		} else {
			logger.warn(logMetadata, "job failed, will be retried");
		}
	});

	worker.on("completed", (job) => {
		void enqueuePendingPayloadForRepository(analyzeChangesQueue, job).catch((enqueueError) => {
			logger.error(
				{ err: enqueueError, jobId: job.id, repositoryId: job.data.repositoryId },
				"failed to enqueue pending repository payload after completion",
			);
		});
	});

	let isShuttingDown = false;

	const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
		if (isShuttingDown) {
			return;
		}
		isShuttingDown = true;

		logger.info({ signal }, "shutting down worker gracefully");
		const timeout = setTimeout(() => {
			logger.warn(
				{ timeoutMs: SHUTDOWN_TIMEOUT_MS },
				"worker shutdown is still waiting for active jobs",
			);
		}, SHUTDOWN_TIMEOUT_MS);
		timeout.unref();

		try {
			await worker.close();
			await analyzeChangesQueue.close();
			await queueEvents.close();
			await dlqQueue.close();
			clearTimeout(timeout);
			logger.info("worker shutdown complete");
			process.exit(exitCode);
		} catch (error) {
			clearTimeout(timeout);
			logger.error({ err: error }, "worker shutdown failed");
			process.exit(1);
		}
	};

	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});

	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});

	try {
		await queueEvents.waitUntilReady();
		await worker.waitUntilReady();
		logger.info(
			{ queue: "analyze-changes", concurrency: env.WORKER_CONCURRENCY },
			"worker started",
		);
		await worker.run();
	} catch (error) {
		logger.error({ err: error }, "worker failed to start");
		await shutdown("STARTUP_FAILURE", 1);
	}
};

void startWorker();
