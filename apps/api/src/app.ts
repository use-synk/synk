import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import type { AppDependencies } from "./composition/dependencies";
import { API_PREFIX } from "./consts";
import type { ApiEnvironment } from "./env";
import { createPrismaWebhookRepositories } from "./infrastructure/prisma/webhook.repositories";
import type { Logger } from "./logger";
import { createErrorHandler } from "./middleware/error-handler";
import { createLoggingMiddleware } from "./middleware/logging";
import { requestIdMiddleware } from "./middleware/request-id";
import { createAuthRoutes } from "./modules/auth/auth.routes";
import { createAuthService } from "./modules/auth/auth.service";
import { createHealthRoutes } from "./modules/health/health.routes";
import { createGitHubIntegrationRoutes } from "./modules/integrations/github";
import { createOrganizationsRoutes } from "./modules/organizations";
import { createProjectsRoutes } from "./modules/projects";
import { createRepositoriesRoutes } from "./modules/repositories";
import { createRunsRoutes } from "./modules/runs";
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
	/**
	 * Override the list-installation-repositories function used by webhook routes.
	 * Intended for testing only. In production this is sourced from dependencies.
	 */
	listInstallationRepositories?: ListInstallationRepositories;
};

export const createApp = (options: AppOptions): OpenAPIHono<AppEnv> => {
	const { env, logger, enqueueAnalyzeChanges, dependencies } = options;

	const webhookRepositories = createPrismaWebhookRepositories();

	// In production, listInstallationRepositories comes from dependencies (GitHub API).
	// Tests may inject a mock via options to exercise webhook route logic in isolation.
	const listInstallationRepositories: ListInstallationRepositories =
		options.listInstallationRepositories ?? dependencies.listInstallationRepositories;

	const app = new OpenAPIHono<AppEnv>();

	const authService = createAuthService();

	const routeCtx: RouteContext = {
		auth: authService,
		gitSha: env.GIT_SHA,
	};

	// CORS must be registered before routes. Required for Better Auth credentialed
	// cross-origin requests from the web app (see better-auth.com/docs/integrations/hono).
	app.use(
		cors({
			origin: env.CORS_ORIGIN,
			allowHeaders: ["Content-Type", "Authorization"],
			allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
			exposeHeaders: ["Content-Length"],
			maxAge: 600,
			credentials: true,
		}),
	);
	app.use(requestIdMiddleware);
	app.use(createLoggingMiddleware({ logger }));

	app.route("/health", createHealthRoutes(routeCtx));
	app.route(`${API_PREFIX}/auth`, createAuthRoutes(authService));
	app.route(
		`${API_PREFIX}/projects`,
		createProjectsRoutes({
			...routeCtx,
			projectService: dependencies.projectService,
		}),
	);
	app.route(
		`${API_PREFIX}/organizations`,
		createOrganizationsRoutes({
			...routeCtx,
			dashboardService: dependencies.dashboardService,
			projectService: dependencies.projectService,
		}),
	);
	app.route(
		`${API_PREFIX}/repositories`,
		createRepositoriesRoutes({
			...routeCtx,
			dashboardService: dependencies.dashboardService,
		}),
	);
	app.route(
		`${API_PREFIX}/runs`,
		createRunsRoutes({
			...routeCtx,
			dashboardService: dependencies.dashboardService,
		}),
	);

	// integrations
	app.route(
		`${API_PREFIX}/integrations/github`,
		createGitHubIntegrationRoutes({
			...routeCtx,
			integrationService: dependencies.integrationService,
			logger,
		}),
	);

	// webhooks
	app.route(
		"/api/v1/webhooks/github",
		createGitHubWebhookRoutes({
			webhookSecret: env.GITHUB_WEBHOOK_SECRET,
			enqueueAnalyzeChanges,
			listInstallationRepositories,
			webhookRepository: webhookRepositories.webhookRepository,
			webhookEventLogRepository: webhookRepositories.webhookEventLogRepository,
		}),
	);

	app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, 404));
	app.onError(createErrorHandler(logger));

	return app;
};
