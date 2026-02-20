import { createInstallationOctokit, credentialsFromEnvironment } from "@synk-ai/github";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { API_PREFIX } from "./consts";
import type { ApiEnvironment } from "./env";
import type { Logger } from "./logger";
import type { AppDependencies } from "./composition/dependencies";
import { createPrismaWebhookRepositories } from "./infrastructure/prisma/webhook.repositories";
import { createErrorHandler } from "./middleware/error-handler";
import { createLoggingMiddleware } from "./middleware/logging";
import { requestIdMiddleware } from "./middleware/request-id";
import { createAuthRoutes } from "./modules/auth/auth.routes";
import { createAuthService } from "./modules/auth/auth.service";
import { createDashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { createHealthRoutes } from "./modules/health/health.routes";
import {
	type ListInstallationRepositories,
	createGitHubWebhookRoutes,
} from "./modules/webhooks/index";
import type { AnalyzeChangesEnqueuer } from "./queues/analyze-changes";
import type { AppEnv, RouteContext } from "./types";

type AppOptions = {
	env: ApiEnvironment;
	logger: Logger;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	dependencies: AppDependencies;
	listInstallationRepositories?: ListInstallationRepositories;
};

export const createApp = (options: AppOptions): Hono<AppEnv> => {
	const { env, logger, enqueueAnalyzeChanges, dependencies } = options;
	const webhookRepositories = createPrismaWebhookRepositories();
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

	const authService = createAuthService();

	const routeCtx: RouteContext = {
		auth: authService,
		gitSha: env.GIT_SHA,
	};

	app.use(cors({ origin: env.CORS_ORIGIN }));
	app.use(requestIdMiddleware);
	app.use(createLoggingMiddleware({ logger }));

	app.route("/health", createHealthRoutes(routeCtx));
	app.route(`${API_PREFIX}/auth`, createAuthRoutes(authService));
	app.route(
		`${API_PREFIX}/dashboard`,
		createDashboardRoutes({
			...routeCtx,
			dashboardService: dependencies.dashboardService,
		}),
	);

	// webhooks
	app.route(
		"/api/webhooks/github",
		createGitHubWebhookRoutes({
			webhookSecret: env.GITHUB_WEBHOOK_SECRET,
			enqueueAnalyzeChanges,
			listInstallationRepositories,
			webhookRepository: webhookRepositories.webhookRepository,
			webhookEventLogRepository: webhookRepositories.webhookEventLogRepository,
			...(env.GITHUB_WEBHOOK_ORGANIZATION_ID !== undefined
				? { installationOrganizationId: env.GITHUB_WEBHOOK_ORGANIZATION_ID }
				: {}),
		}),
	);

	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404));
	app.onError(createErrorHandler(logger));

	return app;
};
