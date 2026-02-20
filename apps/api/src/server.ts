import { db } from "@synk-ai/db";
import { createApp } from "./app.js";
import { buildAppDependencies } from "./composition/dependencies.js";
import { parseApiEnvironment } from "./env.js";
import { createLogger } from "./logger.js";
import {
	createAnalyzeChangesEnqueuer,
	createAnalyzeChangesQueue,
} from "./queues/analyze-changes.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const startServer = (): void => {
	const env = parseApiEnvironment();
	const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
	const analyzeChangesQueue = createAnalyzeChangesQueue(env.REDIS_URL);
	const enqueueAnalyzeChanges = createAnalyzeChangesEnqueuer(analyzeChangesQueue, db);
	const dependencies = buildAppDependencies({ enqueueAnalyzeChanges });

	const app = createApp({ env, logger, enqueueAnalyzeChanges, dependencies });

	const server = Bun.serve({
		fetch: app.fetch,
		port: env.PORT,
		hostname: env.HOST,
	});

	logger.info({ port: server.port, host: env.HOST }, "API server started");

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
