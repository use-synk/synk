import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AppDependencies } from "../composition/dependencies";
import { createApp } from "../app";
import { createLogger } from "../logger";

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
	const app = createApp({
		env: {
			NODE_ENV: "production",
			PORT: 3030,
			HOST: "0.0.0.0",
			CORS_ORIGIN: "*",
			LOG_LEVEL: "silent",
			GIT_SHA: "openapi",
			REDIS_URL: "redis://localhost:6379",
			GITHUB_APP_ID: 1,
			GITHUB_PRIVATE_KEY: "placeholder",
			GITHUB_WEBHOOK_SECRET: "placeholder",
			GITHUB_APP_SLUG: "synk-ai",
		},
		logger: createLogger("silent", false),
		enqueueAnalyzeChanges: async () => undefined,
		dependencies: createPlaceholderDependencies(),
		listInstallationRepositories: async () => [],
	});
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
