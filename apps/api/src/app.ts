import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiEnvironment } from "./env.js";
import type { Logger } from "./logger.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createLoggingMiddleware } from "./middleware/logging.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import type { AnalyzeChangesEnqueuer } from "./queues/analyze-changes.js";
import { type WebhookDatabase, createGitHubWebhookRoute } from "./routes/github-webhooks.js";
import { createHealthRoute } from "./routes/health.js";
import type { AppEnv } from "./types.js";

type AppOptions = {
	env: ApiEnvironment;
	logger: Logger;
	db: WebhookDatabase;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
};

export const createApp = (options: AppOptions): Hono<AppEnv> => {
	const { env, logger, db, enqueueAnalyzeChanges } = options;
	const app = new Hono<AppEnv>();

	app.use(cors({ origin: env.CORS_ORIGIN }));
	app.use(requestIdMiddleware);
	app.use(createLoggingMiddleware({ logger }));

	app.route("/health", createHealthRoute(env.GIT_SHA));
	app.route(
		"/api/webhooks",
		createGitHubWebhookRoute({
			db,
			webhookSecret: env.GITHUB_WEBHOOK_SECRET,
			enqueueAnalyzeChanges,
		}),
	);

	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404));
	app.onError(createErrorHandler(logger));

	return app;
};
