import { createDocGeneration, createDocTriage, createSuggestionTitle } from "@synk-ai/ai";
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
	resolveSuggestionInboxRolloutMode,
} from "@synk-ai/shared";
import { type Job, type JobsOptions, UnrecoverableError } from "bullmq";
import { parseWorkerEnvironment } from "./env";
import { type AnalyzeChangesServices, processAnalyzeChangesJob } from "./jobs/analyze-changes";
import { type Logger, createLogger } from "./logger";
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
const toBullMqSafeJobId = (value: string): string => value.replaceAll(":", "__");

const resolveRedisHostForLogging = (redisUrl: string): string => {
	try {
		return new URL(redisUrl).host;
	} catch {
		return "unknown";
	}
};

const buildJobLogContext = (job: Job<AnalyzeChangesJobPayload>) => ({
	jobId: job.id ?? "unknown",
	queueName: job.queueName,
	attemptNumber: job.attemptsMade + 1,
	maxAttempts: job.opts.attempts ?? 1,
	repositoryId: job.data.repositoryId,
	triggerType: job.data.trigger.type,
	commitSha: job.data.trigger.commitSha,
});

const createAiLoggerAdapter = (logger: Logger) => ({
	info: (message: string, fields: Record<string, unknown>) => {
		logger.info({ aiEvent: message, ...fields }, "ai event");
	},
	warn: (message: string, fields: Record<string, unknown>) => {
		logger.warn({ aiEvent: message, ...fields }, "ai event");
	},
	error: (message: string, fields: Record<string, unknown>) => {
		logger.error({ aiEvent: message, ...fields }, "ai event");
	},
});

type SerializableDiffFile = {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch: string | null;
	previousFilename: string | null;
};

const MAX_PATCH_CHARS = 8_000;

const truncatePatch = (patch: string): string =>
	patch.length <= MAX_PATCH_CHARS
		? patch
		: `${patch.slice(0, MAX_PATCH_CHARS)}\n\n[patch truncated to ${MAX_PATCH_CHARS} chars]`;

const renderDiffFile = (file: SerializableDiffFile): string => {
	const headerLines = [
		`file: ${file.filename}`,
		`status: ${file.status}`,
		`additions: ${file.additions}`,
		`deletions: ${file.deletions}`,
	];
	if (file.previousFilename !== null) {
		headerLines.push(`previous: ${file.previousFilename}`);
	}
	const patchText = file.patch === null ? "[binary or patch omitted]" : truncatePatch(file.patch);
	return `${headerLines.join("\n")}\npatch:\n${patchText}`;
};

const serializeDiffForAi = (files: readonly SerializableDiffFile[]): string =>
	files.map((file) => renderDiffFile(file)).join("\n\n---\n\n");

const createAnalyzeChangesAiServices = (
	apiKey: string,
	logger: Logger,
): Partial<AnalyzeChangesServices> => {
	const aiLogger = createAiLoggerAdapter(logger);
	const triage = createDocTriage({
		apiKey,
		logger: aiLogger,
	});
	const generation = createDocGeneration({
		apiKey,
		logger: aiLogger,
	});
	const title = createSuggestionTitle({
		apiKey,
		logger: aiLogger,
	});

	return {
		runTriage: async (input) => {
			const docPaths = [...new Set(input.docFiles.map((file) => file.path))];
			const docPathSet = new Set(docPaths);
			const result = await triage.triage({
				diff: serializeDiffForAi(input.filteredDiff),
				docFileTree: docPaths.sort((a, b) => a.localeCompare(b)),
			});
			const rawAffectedDocFiles = [...result.output.affectedDocFiles];
			const affectedDocFiles = rawAffectedDocFiles.filter((path) => docPathSet.has(path));
			const unknownAffectedDocFiles = rawAffectedDocFiles.filter((path) => !docPathSet.has(path));
			if (unknownAffectedDocFiles.length > 0) {
				logger.warn(
					{
						aiEvent: "ai.triage.unknown_doc_paths",
						unknownAffectedDocFiles,
						knownDocFileCount: docPaths.length,
					},
					"ai event",
				);
			}

			return {
				needsUpdate: result.output.needsUpdate && !result.skipped,
				affectedDocFiles,
				reasoning: result.output.reasoning,
				confidence: result.output.confidence,
				skippedByConfidence: result.skipped,
				rawAffectedDocFiles,
				tokenUsage: result.tokenUsage,
			};
		},
		runGeneration: async (input) => {
			const baseInstructions = [
				"Triage determined this file likely needs documentation updates based on the code diff.",
				input.triageReasoning ? `Triage reasoning: ${input.triageReasoning}` : null,
			]
				.filter((value): value is string => value !== null)
				.join("\n");
			const request = {
				diff: serializeDiffForAi(input.filteredDiff),
				docFile: {
					path: input.docFile.path,
					content: input.docFile.content,
				},
				customInstructions: baseInstructions,
			};
			let result = await generation.generate(request);
			if (input.mustApplyCodeChanges === true && result.skipped) {
				logger.warn(
					{
						aiEvent: "ai.generate.retry_for_meaningful_change",
						filePath: input.docFile.path,
					},
					"ai event",
				);
				result = await generation.generate({
					...request,
					customInstructions: `${baseInstructions}\nPrevious attempt returned unchanged content. Apply at least one concrete documentation edit that reflects the code diff for this file.`,
				});
			}
			return {
				path: result.filePath,
				content: result.updatedContent,
				reasoning: result.changeDescription,
				tokenUsage: result.tokenUsage,
			};
		},
		generateSuggestionTitle: async (input) => title.generate(input).then((result) => result.title),
	};
};

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
	logger: Logger,
): Promise<void> => {
	const pending = await getPendingPayload(queue, job);
	if (pending === null) {
		return;
	}
	if (pending.payload.repositoryId !== job.data.repositoryId) {
		logger.warn(
			{
				...buildJobLogContext(job),
				pendingRepositoryId: pending.payload.repositoryId,
			},
			"pending payload repository mismatch, skipping replacement",
		);
		return;
	}
	if (pending.payload.trigger.commitSha === job.data.trigger.commitSha) {
		await clearPendingPayload(queue, job);
		logger.debug(
			{
				...buildJobLogContext(job),
			},
			"pending payload matched active commit, pending payload cleared",
		);
		return;
	}

	const previousCommitSha = job.data.trigger.commitSha;
	await job.updateData(pending.payload);
	await clearPendingPayload(queue, job);
	logger.info(
		{
			...buildJobLogContext(job),
			previousCommitSha,
			replacedCommitSha: pending.payload.trigger.commitSha,
		},
		"active job payload replaced with latest pending payload",
	);
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
	logger: Logger,
): Promise<void> => {
	const pending = await getPendingPayload(queue, job);
	if (pending === null) {
		return;
	}

	if (await hasExistingRunForCommit(pending.payload)) {
		await clearPendingPayload(queue, job);
		logger.info(
			{
				...buildJobLogContext(job),
				pendingCommitSha: pending.payload.trigger.commitSha,
			},
			"pending payload dropped because run already exists for commit",
		);
		return;
	}

	const delayMs = calculateCoalesceDelayMs(pending.updatedAtMs);

	const activeJob = await getRepositoryActiveJob(queue, job.data.repositoryId);
	if (activeJob !== null) {
		const redisClient = await queue.client;
		const key = buildAnalyzeChangesPendingPayloadKey(job.data.repositoryId);
		await redisClient.pexpire(key, PENDING_PAYLOAD_TTL_MS);
		logger.debug(
			{
				...buildJobLogContext(job),
				activeJobId: buildAnalyzeChangesActiveJobId(job.data.repositoryId),
				pendingCommitSha: pending.payload.trigger.commitSha,
				pendingPayloadTtlMs: PENDING_PAYLOAD_TTL_MS,
			},
			"active repository job still running, extended pending payload TTL",
		);
		return;
	}

	const activeJobId = toBullMqSafeJobId(buildAnalyzeChangesActiveJobId(job.data.repositoryId));
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
		logger.info(
			{
				...buildJobLogContext(job),
				enqueuedJobId: activeJobId,
				delayMs,
				pendingCommitSha: pending.payload.trigger.commitSha,
			},
			"enqueued pending payload for repository",
		);
	} catch (error) {
		if (!isAlreadyExistingJobError(error)) {
			throw error;
		}

		const jobAfterConflict = await getRepositoryActiveJob(queue, job.data.repositoryId);
		if (jobAfterConflict === null) {
			try {
				await queue.add(job.name, pending.payload, jobOptions);
				await clearPendingPayload(queue, job);
				logger.info(
					{
						...buildJobLogContext(job),
						enqueuedJobId: activeJobId,
						delayMs,
						pendingCommitSha: pending.payload.trigger.commitSha,
					},
					"enqueued pending payload after job-id conflict retry",
				);
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
		logger.warn(
			{
				...buildJobLogContext(job),
				pendingCommitSha: pending.payload.trigger.commitSha,
				pendingPayloadTtlMs: PENDING_PAYLOAD_TTL_MS,
			},
			"pending payload enqueue skipped due to existing active job id",
		);
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
	const suggestionInboxRollout = resolveSuggestionInboxRolloutMode(env);
	const connection = createRedisConnectionOptions({ redisUrl: env.REDIS_URL, logger });
	const analyzeChangesQueue = createAnalyzeChangesQueue(connection);
	logger.info(
		{
			logLevel: env.LOG_LEVEL,
			redisUrlHost: resolveRedisHostForLogging(env.REDIS_URL),
			workerConcurrency: env.WORKER_CONCURRENCY,
			openRouterEnabled: env.OPENROUTER_API_KEY !== undefined,
		},
		"worker runtime configuration",
	);
	logger.info(
		{
			suggestionInboxEnabled: suggestionInboxRollout.suggestionInboxEnabled,
			autoPrEnabled: suggestionInboxRollout.autoPrEnabled,
			autoPrDisabledByFlag: suggestionInboxRollout.autoPrDisabledByFlag,
			decisionMemoryEnabled: suggestionInboxRollout.decisionMemoryEnabled,
		},
		"suggestion inbox rollout flags",
	);

	const servicesOverride: Partial<AnalyzeChangesServices> | undefined =
		env.OPENROUTER_API_KEY !== undefined
			? createAnalyzeChangesAiServices(env.OPENROUTER_API_KEY, logger)
			: undefined;

	const worker = createAnalyzeChangesWorker({
		connection,
		concurrency: env.WORKER_CONCURRENCY,
		processor: async (job: Job<AnalyzeChangesJobPayload>) => {
			await updatePayloadFromPending(analyzeChangesQueue, job, logger);
			await processAnalyzeChangesJob(job, logger, servicesOverride, {
				autoPrEnabled: suggestionInboxRollout.autoPrEnabled,
				decisionMemoryEnabled: suggestionInboxRollout.decisionMemoryEnabled,
			});
		},
	});
	const queueEvents = createAnalyzeChangesQueueEvents(connection);
	const dlqQueue = createAnalyzeChangesDlqQueue(connection);

	worker.on("error", (error) => {
		logger.error({ err: error }, "worker error");
	});
	worker.on("active", (job, prev) => {
		logger.info(
			{
				...buildJobLogContext(job),
				previousState: prev,
			},
			"job started",
		);
	});

	queueEvents.on("error", (error) => {
		logger.error({ err: error }, "queue events error");
	});
	queueEvents.on("active", ({ jobId, prev }) => {
		logger.debug({ jobId, prev }, "queue event active");
	});
	queueEvents.on("waiting", ({ jobId }) => {
		logger.debug({ jobId }, "queue event waiting");
	});
	queueEvents.on("completed", ({ jobId, prev }) => {
		logger.debug({ jobId, prev }, "queue event completed");
	});
	queueEvents.on("stalled", ({ jobId }) => {
		logger.warn({ jobId }, "queue event stalled");
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
			...buildJobLogContext(job),
			attemptsMade: job.attemptsMade,
			isPermanentlyFailed: permanently,
		};

		if (permanently) {
			logger.error(logMetadata, "job permanently failed — moving to dead-letter queue");
			void moveToDlq(job, error, dlqQueue).catch((dlqError) => {
				logger.error(
					{
						err: dlqError,
						...buildJobLogContext(job),
					},
					"failed to add permanently failed job to dead-letter queue",
				);
			});
			void enqueuePendingPayloadForRepository(analyzeChangesQueue, job, logger).catch(
				(enqueueError) => {
					logger.error(
						{
							err: enqueueError,
							...buildJobLogContext(job),
						},
						"failed to enqueue pending repository payload after permanent failure",
					);
				},
			);
		} else {
			logger.warn(logMetadata, "job failed, will be retried");
		}
	});

	worker.on("completed", (job) => {
		const startedAt = job.processedOn ?? null;
		const finishedAt = job.finishedOn ?? null;
		const durationMs =
			startedAt !== null && finishedAt !== null && finishedAt >= startedAt
				? finishedAt - startedAt
				: null;
		logger.info(
			{
				...buildJobLogContext(job),
				startedAt,
				finishedAt,
				durationMs,
			},
			"job completed",
		);
		void enqueuePendingPayloadForRepository(analyzeChangesQueue, job, logger).catch(
			(enqueueError) => {
				logger.error(
					{
						err: enqueueError,
						...buildJobLogContext(job),
					},
					"failed to enqueue pending repository payload after completion",
				);
			},
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
