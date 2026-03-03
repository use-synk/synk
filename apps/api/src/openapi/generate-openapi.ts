import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../composition/dependencies";
import { API_PREFIX } from "../consts";
import { createLogger } from "../logger";
import { createAuthRoutes } from "../modules/auth/auth.routes";
import type { AuthService } from "../modules/auth/auth.service";
import { createHealthRoutes } from "../modules/health/health.routes";
import { createGitHubIntegrationRoutes } from "../modules/integrations/github";
import { createOrganizationsRoutes } from "../modules/organizations";
import { createProjectsRoutes } from "../modules/projects";
import { createRepositoriesRoutes } from "../modules/repositories";
import { createRunsRoutes } from "../modules/runs";
import { createGitHubWebhookRoutes } from "../modules/webhooks";
import type { AppEnv, RouteContext } from "../types";

const NOOP_ERROR = "OpenAPI generation uses non-executed placeholder dependencies";

const unreachable = async <T>(): Promise<T> => {
	throw new Error(NOOP_ERROR);
};

const createPlaceholderDependencies = (): AppDependencies => ({
	dashboardService: {
		patchRepository: unreachable,
		listInstallationRepositories: unreachable,
		listRepositoryRuns: unreachable,
		triggerManualRun: unreachable,
		getRunDetail: unreachable,
		getOrganizationSetupStatus: unreachable,
		listUserOrganizations: unreachable,
	},
	projectService: {
		findProject: unreachable,
		listProjects: unreachable,
		listOrganizationRepositories: unreachable,
		createProject: unreachable,
		updateProject: unreachable,
		deleteProject: unreachable,
	},
	integrationService: {
		initiateInstallation: unreachable,
		completeInstallation: unreachable,
	},
	listInstallationRepositories: async () => [],
});

const generateOpenApi = async (): Promise<void> => {
	const app = new OpenAPIHono<AppEnv>();
	const dependencies = createPlaceholderDependencies();
	const logger = createLogger("silent", false);
	const authService = {
		auth: {
			api: {
				getSession: async () => null,
			},
			handler: async () =>
				new Response(JSON.stringify({ error: { code: "NOT_IMPLEMENTED", message: "stub" } }), {
					status: 501,
					headers: { "content-type": "application/json" },
				}),
		},
	} as unknown as AuthService;
	const routeCtx: RouteContext = {
		auth: authService,
		gitSha: "openapi",
	};

	app.route("/health", createHealthRoutes(routeCtx));
	app.route(`${API_PREFIX}/auth`, createAuthRoutes(authService));
	app.route(
		`${API_PREFIX}/projects`,
		createProjectsRoutes({ ...routeCtx, projectService: dependencies.projectService }),
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
		createRepositoriesRoutes({ ...routeCtx, dashboardService: dependencies.dashboardService }),
	);
	app.route(
		`${API_PREFIX}/runs`,
		createRunsRoutes({ ...routeCtx, dashboardService: dependencies.dashboardService }),
	);
	app.route(
		`${API_PREFIX}/integrations/github`,
		createGitHubIntegrationRoutes({
			...routeCtx,
			integrationService: dependencies.integrationService,
			logger,
		}),
	);
	app.route(
		`${API_PREFIX}/webhooks/github`,
		createGitHubWebhookRoutes({
			webhookSecret: "placeholder",
			enqueueAnalyzeChanges: async () => undefined,
			listInstallationRepositories: async () => [],
			webhookRepository: {
				findInstallation: async () => null,
				upsertInstallation: async () => ({ id: "stub-installation-id" }),
				markInstallationDeleted: async () => undefined,
				findActiveRepository: async () => null,
				upsertRepository: async () => undefined,
				markRepositoriesRemoved: async () => undefined,
			},
			webhookEventLogRepository: {
				createDelivery: async () => undefined,
				markProcessed: async () => undefined,
			},
		}),
	);

	app.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
		type: "apiKey",
		in: "cookie",
		name: "better-auth.session_token",
	});

	const document = app.getOpenAPI31Document({
		openapi: "3.1.0",
		info: {
			title: "Synk API",
			version: "v1",
			description: "Resource-oriented API contract for Synk services",
		},
	});

	const outputDir = resolve(process.cwd(), "openapi");
	const outputPath = resolve(outputDir, "openapi.json");
	await mkdir(outputDir, { recursive: true });
	await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
};

await generateOpenApi();
