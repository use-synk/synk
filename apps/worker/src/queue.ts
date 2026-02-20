import {
	ANALYZE_CHANGES_DLQ_NAME,
	ANALYZE_CHANGES_JOB_BACKOFF_TYPE,
	ANALYZE_CHANGES_QUEUE_NAME,
	type AnalyzeChangesJobPayload,
} from "@synk-ai/shared";
import { type ConnectionOptions, type Processor, Queue, QueueEvents, Worker } from "bullmq";
import type { Logger } from "./logger";

const REDIS_RETRY_BASE_DELAY_MS = 250;
const REDIS_RETRY_MAX_DELAY_MS = 5_000;
const REDIS_MAX_RETRIES = 20;

/**
 * Retry delays (ms) for the custom synk-exponential backoff strategy.
 * Index 0 = delay before 2nd attempt (1st retry), and so on.
 * Values: 30 s → 2 min → 10 min (safety fallback for future attempts > 3).
 */
const JOB_RETRY_DELAYS_MS: number[] = [30_000, 120_000, 600_000];
const JOB_RETRY_FALLBACK_DELAY_MS = 600_000;

// ---------------------------------------------------------------------------
// Dead-letter queue payload
// ---------------------------------------------------------------------------

export type AnalyzeChangesDlqPayload = {
	/** Original BullMQ job ID, for tracing. */
	originalJobId: string | undefined;
	/** ISO-8601 timestamp of when the job was moved to the DLQ. */
	failedAt: string;
	/** Human-readable error message from the last failed attempt. */
	errorMessage: string;
	/** Total attempts made before the job was permanently failed. */
	attemptsMade: number;
	/** Original job payload, preserved for requeue or debugging. */
	data: AnalyzeChangesJobPayload;
};

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

type WorkerOptions = {
	connection: ConnectionOptions;
	concurrency: number;
	processor: Processor<AnalyzeChangesJobPayload, void, string>;
};

/**
 * Custom backoff strategy: maps attempt number → delay in ms.
 * BullMQ calls this when job options specify `backoff.type === ANALYZE_CHANGES_JOB_BACKOFF_TYPE`.
 * `attemptsMade` is 1-indexed: 1 = delay before the 2nd attempt, 2 = before 3rd, etc.
 *
 * NOTE: If `type` does not match ANALYZE_CHANGES_JOB_BACKOFF_TYPE (e.g. a job
 * is enqueued with a different or missing backoff strategy name), the function
 * silently falls back to JOB_RETRY_FALLBACK_DELAY_MS (10 min). This is a known
 * operational gap — any misconfigured job will still retry, just with the maximum
 * delay. Monitor for unexpectedly long retry delays as a signal of misconfiguration.
 */
const synkExponentialBackoff = (attemptsMade: number, type?: string): number => {
	if (type !== ANALYZE_CHANGES_JOB_BACKOFF_TYPE) {
		return JOB_RETRY_FALLBACK_DELAY_MS;
	}
	const delay = JOB_RETRY_DELAYS_MS[attemptsMade - 1];
	return delay ?? JOB_RETRY_FALLBACK_DELAY_MS;
};

export const createAnalyzeChangesWorker = (
	options: WorkerOptions,
): Worker<AnalyzeChangesJobPayload> => {
	const { connection, concurrency, processor } = options;

	return new Worker<AnalyzeChangesJobPayload>(ANALYZE_CHANGES_QUEUE_NAME, processor, {
		connection,
		concurrency,
		autorun: false,
		settings: {
			backoffStrategy: synkExponentialBackoff,
		},
	});
};

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export const createAnalyzeChangesQueueEvents = (connection: ConnectionOptions): QueueEvents => {
	return new QueueEvents(ANALYZE_CHANGES_QUEUE_NAME, { connection });
};

export const createAnalyzeChangesQueue = (
	connection: ConnectionOptions,
): Queue<AnalyzeChangesJobPayload> => {
	return new Queue<AnalyzeChangesJobPayload>(ANALYZE_CHANGES_QUEUE_NAME, { connection });
};

/**
 * Dead-letter queue for analyze-changes jobs that have exhausted all retries
 * or failed with an unrecoverable error. Jobs are retained for post-mortem
 * inspection and potential manual requeue. A bounded window of 1 000 completed
 * entries is kept to prevent unbounded growth in high-failure scenarios, while
 * failed entries are preserved indefinitely so no information is lost.
 */
export const createAnalyzeChangesDlqQueue = (
	connection: ConnectionOptions,
): Queue<AnalyzeChangesDlqPayload> => {
	return new Queue<AnalyzeChangesDlqPayload>(ANALYZE_CHANGES_DLQ_NAME, {
		connection,
		defaultJobOptions: {
			attempts: 1,
			removeOnComplete: { count: 1_000 },
			removeOnFail: false,
		},
	});
};
