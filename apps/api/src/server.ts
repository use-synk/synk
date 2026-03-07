import { db } from "@synk-ai/db";
import { resolveSuggestionInboxRolloutMode } from "@synk-ai/shared";
import { createApp } from "./app";
import { buildAppDependencies } from "./composition/dependencies";
import { parseApiEnvironment } from "./env";
import { createLogger } from "./logger";
import { createAnalyzeChangesEnqueuer, createAnalyzeChangesQueue } from "./queues/analyze-changes";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const startServer = (): void => {
	const env = parseApiEnvironment();
	const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
	const suggestionInboxRollout = resolveSuggestionInboxRolloutMode(env);
	const analyzeChangesQueue = createAnalyzeChangesQueue(env.REDIS_URL);
	const enqueueAnalyzeChanges = createAnalyzeChangesEnqueuer(analyzeChangesQueue, db, logger);
	logger.info(
		{
			logLevel: env.LOG_LEVEL,
			host: env.HOST,
			port: env.PORT,
			redisUrlConfigured: env.REDIS_URL.length > 0,
			corsOrigin: env.CORS_ORIGIN,
		},
		"api runtime configuration",
	);

	const dependencies = buildAppDependencies({ env, enqueueAnalyzeChanges });

	const app = createApp({ env, logger, enqueueAnalyzeChanges, dependencies });

	const server = Bun.serve({
		fetch: app.fetch,
		port: env.PORT,
		hostname: env.HOST,
	});

	logger.info({ port: server.port, host: env.HOST }, "API server started");
	logger.info(
		{
			suggestionInboxEnabled: suggestionInboxRollout.suggestionInboxEnabled,
			autoPrEnabled: suggestionInboxRollout.autoPrEnabled,
			autoPrDisabledByFlag: suggestionInboxRollout.autoPrDisabledByFlag,
			decisionMemoryEnabled: suggestionInboxRollout.decisionMemoryEnabled,
		},
		"suggestion inbox rollout flags",
	);

	let isShuttingDown = false;

	const shutdown = async (signal: string): Promise<void> => {
		if (isShuttingDown) {
			return;
		}
		isShuttingDown = true;

		logger.info({ signal }, "shutting down gracefully");

		const timeout = setTimeout(() => {
			logger.error("forced shutdown: timeout exceeded");
			process.exit(1);
		}, SHUTDOWN_TIMEOUT_MS);

		timeout.unref();

		try {
			await analyzeChangesQueue.close();
			await server.stop();
			clearTimeout(timeout);
			logger.info("server closed");
			process.exit(0);
		} catch (error) {
			clearTimeout(timeout);
			logger.error({ err: error }, "failed during shutdown");
			process.exit(1);
		}
	};

	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
};

startServer();
