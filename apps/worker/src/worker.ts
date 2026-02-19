import type { AnalyzeChangesJobPayload } from "@synk-ai/shared";
import { UnrecoverableError, type Job } from "bullmq";
import { parseWorkerEnvironment } from "./env.js";
import { processAnalyzeChangesJob } from "./jobs/analyze-changes.js";
import { createLogger } from "./logger.js";
import {
	createAnalyzeChangesQueueEvents,
	createAnalyzeChangesDlqQueue,
	createAnalyzeChangesWorker,
	createRedisConnectionOptions,
	type AnalyzeChangesDlqPayload,
} from "./queue.js";

const SHUTDOWN_TIMEOUT_MS = 30_000;

const isJobPermanentlyFailed = (
	job: Job<AnalyzeChangesJobPayload>,
	error: Error,
): boolean => {
	const maxAttempts = job.opts.attempts ?? 1;
	return (job.attemptsMade >= maxAttempts) || (error instanceof UnrecoverableError);
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

	const worker = createAnalyzeChangesWorker({
		connection,
		concurrency: env.WORKER_CONCURRENCY,
		processor: async (job: Job<AnalyzeChangesJobPayload>) => processAnalyzeChangesJob(job, logger),
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
		} else {
			logger.warn(logMetadata, "job failed, will be retried");
		}
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
