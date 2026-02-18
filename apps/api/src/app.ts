import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiEnvironment } from "./env.js";
import type { Logger } from "./logger.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createLoggingMiddleware } from "./middleware/logging.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createHealthRoute } from "./routes/health.js";
import type { AppEnv } from "./types.js";

type AppOptions = {
	env: ApiEnvironment;
	logger: Logger;
};

export const createApp = (options: AppOptions): Hono<AppEnv> => {
	const { env, logger } = options;
	const app = new Hono<AppEnv>();

	app.use(cors({ origin: env.CORS_ORIGIN }));
	app.use(requestIdMiddleware);
	app.use(createLoggingMiddleware({ logger }));

	app.route("/health", createHealthRoute(env.GIT_SHA));

	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404));
	app.onError(createErrorHandler(logger));

	return app;
};
