import { ANALYZE_CHANGES_QUEUE_NAME, type AnalyzeChangesJobPayload } from "@synk-ai/shared";
import { type ConnectionOptions, type Processor, QueueEvents, Worker } from "bullmq";
import type { Logger } from "./logger.js";

const REDIS_RETRY_BASE_DELAY_MS = 250;
const REDIS_RETRY_MAX_DELAY_MS = 5_000;
const REDIS_MAX_RETRIES = 20;

type RedisConnectionOptions = {
	redisUrl: string;
	logger: Logger;
};

type RedisRetryStrategy = (attempt: number) => number | null;

const calculateRetryDelay = (attempt: number): number =>
	Math.min(REDIS_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), REDIS_RETRY_MAX_DELAY_MS);

const createRedisRetryStrategy = (logger: Logger): RedisRetryStrategy => {
	return (attempt) => {
		if (attempt > REDIS_MAX_RETRIES) {
			logger.error({ attempt }, "redis reconnect retries exhausted");
			return null;
		}

		const retryDelayMs = calculateRetryDelay(attempt);
		logger.warn({ attempt, retryDelayMs }, "redis reconnect scheduled");
		return retryDelayMs;
	};
};

export const createRedisConnectionOptions = (
	options: RedisConnectionOptions,
): ConnectionOptions => {
	const { redisUrl, logger } = options;

	return {
		url: redisUrl,
		maxRetriesPerRequest: null,
		enableReadyCheck: true,
		retryStrategy: createRedisRetryStrategy(logger),
	};
};

type WorkerOptions = {
	connection: ConnectionOptions;
	concurrency: number;
	processor: Processor<AnalyzeChangesJobPayload, void, string>;
};

export const createAnalyzeChangesWorker = (
	options: WorkerOptions,
): Worker<AnalyzeChangesJobPayload> => {
	const { connection, concurrency, processor } = options;

	return new Worker<AnalyzeChangesJobPayload>(ANALYZE_CHANGES_QUEUE_NAME, processor, {
		connection,
		concurrency,
		autorun: false,
	});
};

export const createAnalyzeChangesQueueEvents = (connection: ConnectionOptions): QueueEvents => {
	return new QueueEvents(ANALYZE_CHANGES_QUEUE_NAME, { connection });
};
