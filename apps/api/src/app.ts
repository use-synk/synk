import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiEnvironment } from "./env";
import type { Logger } from "./logger";
import { createErrorHandler } from "./middleware/error-handler";
import { createLoggingMiddleware } from "./middleware/logging";
import { requestIdMiddleware } from "./middleware/request-id";
import { createHealthRoute } from "./routes/health";
import type { AppEnv } from "./types";

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
