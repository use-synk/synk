import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { createApp } from "./app.js";
import { parseApiEnvironment } from "./env.js";
import { createLogger } from "./logger.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const startServer = (): void => {
	const env = parseApiEnvironment();
	const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === "development");
	const app = createApp({ env, logger });

	const server: ServerType = serve(
		{ fetch: app.fetch, port: env.PORT, hostname: env.HOST },
		(info) => {
			logger.info({ port: info.port, host: env.HOST }, "API server started");
		},
	);

	const shutdown = (signal: string): void => {
		logger.info({ signal }, "shutting down gracefully");

		const timeout = setTimeout(() => {
			logger.error("forced shutdown: timeout exceeded");
			process.exit(1);
		}, SHUTDOWN_TIMEOUT_MS);

		timeout.unref();

		server.close(() => {
			clearTimeout(timeout);
			logger.info("server closed");
			process.exit(0);
		});
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
};

startServer();
