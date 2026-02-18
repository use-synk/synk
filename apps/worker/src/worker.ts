import type { AnalyzeChangesJobPayload } from "@synk-ai/shared";
import type { Job } from "bullmq";
import { parseWorkerEnvironment } from "./env.js";
import { processAnalyzeChangesJob } from "./jobs/analyze-changes.js";
import { createLogger } from "./logger.js";
import {
	createAnalyzeChangesQueueEvents,
	createAnalyzeChangesWorker,
	createRedisConnectionOptions,
} from "./queue.js";

const SHUTDOWN_TIMEOUT_MS = 30_000;

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

	worker.on("error", (error) => {
		logger.error({ err: error }, "worker error");
	});

	queueEvents.on("error", (error) => {
		logger.error({ err: error }, "queue events error");
	});

	worker.on("failed", (job, error) => {
		logger.error(
			{
				err: error,
				jobId: job?.id ?? "unknown",
				attemptNumber: job ? job.attemptsMade + 1 : 0,
			},
			"job failed",
		);
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
