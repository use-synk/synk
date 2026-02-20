import { createInstallationOctokit, credentialsFromEnvironment } from "@synk-ai/github";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { API_PREFIX } from "./consts.js";
import { buildAppDependencies, type AppDependencies } from "./composition/dependencies.js";
import type { ApiEnvironment } from "./env.js";
import type { Logger } from "./logger.js";
import { createErrorHandler } from "./middleware/error-handler.js";
import { createLoggingMiddleware } from "./middleware/logging.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { createAuthRoutes } from "./modules/auth/auth.routes.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { createDashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { createHealthRoutes } from "./modules/health/health.routes.js";
import {
	type ListInstallationRepositories,
	createGitHubWebhookRoutes,
} from "./modules/webhooks/index.js";
import type { AnalyzeChangesEnqueuer } from "./queues/analyze-changes.js";
import type { AppEnv, RouteContext } from "./types.js";

type AppOptions = {
	env: ApiEnvironment;
	logger: Logger;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	dependencies?: AppDependencies;
	listInstallationRepositories?: ListInstallationRepositories;
};

export const createApp = (options: AppOptions): Hono<AppEnv> => {
	const { env, logger, enqueueAnalyzeChanges } = options;
	const dependencies =
		options.dependencies ?? buildAppDependencies({ enqueueAnalyzeChanges });
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
	app.route(`${API_PREFIX}/auth`, createAuthRoutes());
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
			...(env.GITHUB_WEBHOOK_ORGANIZATION_ID !== undefined
				? { installationOrganizationId: env.GITHUB_WEBHOOK_ORGANIZATION_ID }
				: {}),
		}),
	);

	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404));
	app.onError(createErrorHandler(logger));

	return app;
};
