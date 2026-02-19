import { createInstallationOctokit, credentialsFromEnvironment } from "@synk-ai/github";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ApiEnvironment } from "./env.js";
import type { Logger } from "./logger.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createLoggingMiddleware } from "./middleware/logging.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import type { AnalyzeChangesEnqueuer } from "./queues/analyze-changes.js";
import { type DashboardDatabase, createDashboardRoute } from "./routes/dashboard.js";
import {
	type ListInstallationRepositories,
	type WebhookDatabase,
	createGitHubWebhookRoute,
} from "./routes/github-webhooks.js";
import { createHealthRoute } from "./routes/health.js";
import type { AppEnv } from "./types.js";

type AppOptions = {
	env: ApiEnvironment;
	logger: Logger;
	db: WebhookDatabase & DashboardDatabase;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	listInstallationRepositories?: ListInstallationRepositories;
};

export const createApp = (options: AppOptions): Hono<AppEnv> => {
	const { env, logger, db, enqueueAnalyzeChanges } = options;
	const githubCredentials = credentialsFromEnvironment(env);
	const listInstallationRepositories: ListInstallationRepositories =
		options.listInstallationRepositories ??
		(async (installationId) => {
			const installationOctokit = createInstallationOctokit(installationId, githubCredentials);
			return installationOctokit.paginate(
				installationOctokit.rest.apps.listReposAccessibleToInstallation,
				{ per_page: 100 },
			);
		});

	const app = new Hono<AppEnv>();
	const webhookOptions: {
		db: WebhookDatabase;
		webhookSecret: string;
		enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
		listInstallationRepositories: ListInstallationRepositories;
		installationOrganizationId?: string;
	} = {
		db,
		webhookSecret: env.GITHUB_WEBHOOK_SECRET,
		enqueueAnalyzeChanges,
		listInstallationRepositories,
	};

	if (env.GITHUB_WEBHOOK_ORGANIZATION_ID !== undefined) {
		webhookOptions.installationOrganizationId = env.GITHUB_WEBHOOK_ORGANIZATION_ID;
	}

	app.use(cors({ origin: env.CORS_ORIGIN }));
	app.use(requestIdMiddleware);
	app.use(createLoggingMiddleware({ logger }));

	app.route("/health", createHealthRoute(env.GIT_SHA));
	app.route("/api/webhooks", createGitHubWebhookRoute(webhookOptions));
	app.route("/api", createDashboardRoute(db, enqueueAnalyzeChanges));

	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404));
	app.onError(createErrorHandler(logger));

	return app;
};
