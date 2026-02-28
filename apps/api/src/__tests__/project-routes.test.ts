import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createMockDb } from "@synk-ai/test-utils";
import { HTTPException } from "hono/http-exception";
import type { AppDependencies } from "../composition/dependencies";
import { AccessDeniedError } from "../domain/errors/access-denied-error";
import type { ProjectServiceContract } from "../domain/services/project-service";
import { createLogger } from "../logger";

const mockDb = createMockDb();

mock.module("@synk-ai/db", () => ({ db: mockDb }));

const SESSION_TOKEN = "session-token";
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_SLUG = "acme";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const REPOSITORY_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_REPOSITORY_ID = "55555555-5555-4555-8555-555555555555";
const DOCS_REPOSITORY_ID = "66666666-6666-4666-8666-666666666666";
const PROJECT_NAME = "my-project";
const USER_ID = "user-1";
const NOW = new Date("2026-02-19T20:00:00.000Z");
const NOW_ISO = NOW.toISOString();

const CREATED_PROJECT = {
	id: PROJECT_ID,
	name: PROJECT_NAME,
	organizationId: ORGANIZATION_ID,
	sourceRepositoryId: SOURCE_REPOSITORY_ID,
	docsRepositoryId: DOCS_REPOSITORY_ID,
	config: {},
	createdAt: NOW,
	updatedAt: NOW,
};

type SessionResult = {
	user: { id: string };
	session: { token: string; userId: string; expiresAt: Date };
} | null;

const getSessionMock = mock<() => Promise<SessionResult>>(async () => ({
	user: { id: USER_ID },
	session: {
		token: SESSION_TOKEN,
		userId: USER_ID,
		expiresAt: new Date("2099-01-01T00:00:00.000Z"),
	},
}));

mock.module("../modules/auth/auth.service.js", () => ({
	createAuthService: () => ({
		auth: {
			api: {
				getSession: getSessionMock,
			},
		},
	}),
}));

const { createApp } = await import("../app");

const createProjectServiceMock = () => {
	const listOrganizationRepositories = mock(async () => ({
		items: [
			{
				id: REPOSITORY_ID,
				installationId: INSTALLATION_ID,
				fullName: "acme/docs",
				defaultBranch: "main",
				status: "active" as const,
				isActive: true,
				updatedAt: NOW,
			},
		],
		total: 1,
	}));

	const listProjects = mock(async () => ({ items: [], total: 0 }));
	const createProject = mock(async () => {
		throw new Error("createProject should not be called in repository listing tests");
	});
	const findProject = mock(async () => null);
	const updateProject = mock(async () => {
		throw new Error("updateProject should not be called in repository listing tests");
	});
	const deleteProject = mock(async () => undefined);

	return {
		listOrganizationRepositories,
		listProjects,
		createProject,
		findProject,
		updateProject,
		deleteProject,
	};
};

const createTestApp = (projectService: ProjectServiceContract) => {
	const logger = createLogger("silent", false);
	const dependencies: AppDependencies = {
		dashboardService: {
			patchRepository: mock(async () => {
				throw new Error("dashboardService should not be called in project tests");
			}),
			listInstallationRepositories: mock(async () => ({ items: [], total: 0 })),
			listRepositoryRuns: mock(async () => ({ items: [], total: 0 })),
			triggerManualRun: mock(async () => {
				throw new Error("dashboardService should not be called in project tests");
			}),
			getRunDetail: mock(async () => {
				throw new Error("dashboardService should not be called in project tests");
			}),
			getOrganizationSetupStatus: mock(async () => {
				throw new Error("dashboardService should not be called in project tests");
			}),
		},
		projectService,
		integrationService: {
			initiateInstallation: mock(async () => {
				throw new Error("integrationService should not be called in project tests");
			}),
			completeInstallation: mock(async () => {
				throw new Error("integrationService should not be called in project tests");
			}),
		},
		listInstallationRepositories: mock(async () => []),
	};
	const enqueueAnalyzeChanges = mock(async () => undefined);

	return createApp({
		logger,
		enqueueAnalyzeChanges,
		dependencies,
		env: {
			NODE_ENV: "test",
			PORT: 3000,
			HOST: "127.0.0.1",
			CORS_ORIGIN: "*",
			LOG_LEVEL: "silent",
			GIT_SHA: "test",
			REDIS_URL: "redis://localhost:6379",
			GITHUB_APP_ID: 1,
			GITHUB_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
			GITHUB_WEBHOOK_SECRET: "test-webhook-secret",
			GITHUB_APP_SLUG: "test-app",
		},
	});
};

const authHeaders = (): Record<string, string> => ({
	authorization: `Bearer ${SESSION_TOKEN}`,
});

describe("project routes — GET /organizations/:slugOrId/repositories", () => {
	beforeEach(() => {
		mock.restore();
		getSessionMock.mockResolvedValue({
			user: { id: USER_ID },
			session: {
				token: SESSION_TOKEN,
				userId: USER_ID,
				expiresAt: new Date("2099-01-01T00:00:00.000Z"),
			},
		});
	});

	it("returns repository list with pagination envelope for an organization UUID", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		const response = await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/repositories`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: Array<{ id: string; installationId: string; fullName: string; updatedAt: string }>;
			pagination: { page: number; pageSize: number; total: number; totalPages: number };
		};

		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.id).toBe(REPOSITORY_ID);
		expect(body.data[0]?.installationId).toBe(INSTALLATION_ID);
		expect(body.data[0]?.fullName).toBe("acme/docs");
		expect(body.data[0]?.updatedAt).toBe(NOW_ISO);
		expect(body.pagination).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
	});

	it("passes the slugOrId parameter through to the service unchanged", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		await app.request(`/api/v1/organizations/${ORGANIZATION_SLUG}/repositories`, {
			headers: authHeaders(),
		});

		expect(projectService.listOrganizationRepositories).toHaveBeenCalledWith({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			pagination: { page: 1, pageSize: 10 },
		});
	});

	it("calls the service with userId from the authenticated session", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/repositories`, {
			headers: authHeaders(),
		});

		expect(projectService.listOrganizationRepositories).toHaveBeenCalledWith({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			pagination: { page: 1, pageSize: 10 },
		});
	});

	it("coerces pagination query params from strings to numbers", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/repositories?page=2&pageSize=25`, {
			headers: authHeaders(),
		});

		expect(projectService.listOrganizationRepositories).toHaveBeenCalledWith({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			pagination: { page: 2, pageSize: 25 },
		});
	});

	it("reflects custom page and pageSize in the pagination envelope", async () => {
		const projectService = createProjectServiceMock();
		projectService.listOrganizationRepositories.mockResolvedValueOnce({
			items: [],
			total: 42,
		});
		const app = createTestApp(projectService);

		const response = await app.request(
			`/api/v1/organizations/${ORGANIZATION_ID}/repositories?page=3&pageSize=5`,
			{ headers: authHeaders() },
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			pagination: { page: number; pageSize: number; total: number; totalPages: number };
		};
		expect(body.pagination).toEqual({ page: 3, pageSize: 5, total: 42, totalPages: 9 });
	});

	it("returns 401 when the request has no authentication", async () => {
		getSessionMock.mockResolvedValue(null);
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		const response = await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/repositories`);

		expect(response.status).toBe(401);
		expect(projectService.listOrganizationRepositories).not.toHaveBeenCalled();
	});

	it("returns 400 when page is below the minimum value", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		const response = await app.request(
			`/api/v1/organizations/${ORGANIZATION_ID}/repositories?page=0`,
			{ headers: authHeaders() },
		);

		expect(response.status).toBe(400);
		expect(projectService.listOrganizationRepositories).not.toHaveBeenCalled();
	});

	it("returns 400 when pageSize exceeds the maximum value", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		const response = await app.request(
			`/api/v1/organizations/${ORGANIZATION_ID}/repositories?pageSize=101`,
			{ headers: authHeaders() },
		);

		expect(response.status).toBe(400);
		expect(projectService.listOrganizationRepositories).not.toHaveBeenCalled();
	});

	it("returns 403 when the service throws a 403 HTTPException", async () => {
		const projectService = createProjectServiceMock();
		projectService.listOrganizationRepositories.mockRejectedValueOnce(
			new HTTPException(403, { message: "You are not a member of this organization" }),
		);
		const app = createTestApp(projectService);

		const response = await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/repositories`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(403);
	});

	it("returns 403 when the service throws an AccessDeniedError", async () => {
		const projectService = createProjectServiceMock();
		projectService.listOrganizationRepositories.mockRejectedValueOnce(
			new AccessDeniedError("You are not a member of this organization"),
		);
		const app = createTestApp(projectService);

		const response = await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/repositories`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(403);
	});

	it("returns 404 when the service reports the organization was not found", async () => {
		const projectService = createProjectServiceMock();
		projectService.listOrganizationRepositories.mockRejectedValueOnce(
			new HTTPException(404, { message: "Organization not found" }),
		);
		const app = createTestApp(projectService);

		const response = await app.request(`/api/v1/organizations/${ORGANIZATION_SLUG}/repositories`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(404);
	});
});

describe("project routes — GET /organizations/:slugOrId/projects", () => {
	beforeEach(() => {
		mock.restore();
		getSessionMock.mockResolvedValue({
			user: { id: USER_ID },
			session: {
				token: SESSION_TOKEN,
				userId: USER_ID,
				expiresAt: new Date("2099-01-01T00:00:00.000Z"),
			},
		});
	});

	it("returns project list with pagination envelope for an organization UUID", async () => {
		const projectService = createProjectServiceMock();
		projectService.listProjects.mockResolvedValueOnce({
			items: [CREATED_PROJECT],
			total: 1,
		});
		const app = createTestApp(projectService);

		const response = await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/projects`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: Array<{ id: string; name: string; updatedAt: string }>;
			pagination: { page: number; pageSize: number; total: number; totalPages: number };
		};

		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.id).toBe(PROJECT_ID);
		expect(body.data[0]?.name).toBe(PROJECT_NAME);
		expect(body.data[0]?.updatedAt).toBe(NOW_ISO);
		expect(body.pagination).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
	});

	it("passes a slug through to the service unchanged", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		await app.request(`/api/v1/organizations/${ORGANIZATION_SLUG}/projects`, {
			headers: authHeaders(),
		});

		expect(projectService.listProjects).toHaveBeenCalledWith({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			pagination: { page: 1, pageSize: 10 },
		});
	});

	it("returns 401 when the request has no authentication", async () => {
		getSessionMock.mockResolvedValue(null);
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		const response = await app.request(`/api/v1/organizations/${ORGANIZATION_ID}/projects`);

		expect(response.status).toBe(401);
		expect(projectService.listProjects).not.toHaveBeenCalled();
	});
});

describe("project routes — POST /project", () => {
	beforeEach(() => {
		mock.restore();
		getSessionMock.mockResolvedValue({
			user: { id: USER_ID },
			session: {
				token: SESSION_TOKEN,
				userId: USER_ID,
				expiresAt: new Date("2099-01-01T00:00:00.000Z"),
			},
		});
	});

	const validBody = () => ({
		name: PROJECT_NAME,
		slugOrId: ORGANIZATION_ID,
		sourceRepositoryId: SOURCE_REPOSITORY_ID,
		docsRepositoryId: DOCS_REPOSITORY_ID,
	});

	it("returns 200 with the created project wrapped in a data envelope", async () => {
		const projectService = createProjectServiceMock();
		projectService.createProject.mockResolvedValueOnce(CREATED_PROJECT);
		const app = createTestApp(projectService);

		const response = await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify(validBody()),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: {
				id: string;
				name: string;
				organizationId: string;
				sourceRepositoryId: string;
				docsRepositoryId: string;
			};
		};
		expect(body.data.id).toBe(PROJECT_ID);
		expect(body.data.name).toBe(PROJECT_NAME);
		expect(body.data.organizationId).toBe(ORGANIZATION_ID);
		expect(body.data.sourceRepositoryId).toBe(SOURCE_REPOSITORY_ID);
		expect(body.data.docsRepositoryId).toBe(DOCS_REPOSITORY_ID);
	});

	it("calls the service with userId from the authenticated session and all body fields", async () => {
		const projectService = createProjectServiceMock();
		projectService.createProject.mockResolvedValueOnce(CREATED_PROJECT);
		const app = createTestApp(projectService);

		await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify(validBody()),
		});

		expect(projectService.createProject).toHaveBeenCalledWith({
			userId: USER_ID,
			name: PROJECT_NAME,
			slugOrId: ORGANIZATION_ID,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});
	});

	it("passes a slug through to the service unchanged", async () => {
		const projectService = createProjectServiceMock();
		projectService.createProject.mockResolvedValueOnce(CREATED_PROJECT);
		const app = createTestApp(projectService);

		await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ ...validBody(), slugOrId: ORGANIZATION_SLUG }),
		});

		expect(projectService.createProject).toHaveBeenCalledWith(
			expect.objectContaining({ slugOrId: ORGANIZATION_SLUG }),
		);
	});

	it("returns 404 when the service reports the organization was not found", async () => {
		const projectService = createProjectServiceMock();
		projectService.createProject.mockRejectedValueOnce(
			new HTTPException(404, { message: "Organization not found" }),
		);
		const app = createTestApp(projectService);

		const response = await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({ ...validBody(), slugOrId: "unknown-slug" }),
		});

		expect(response.status).toBe(404);
	});

	it("returns 400 when a required body field is missing", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);
		const { name: _omitted, ...bodyWithoutName } = validBody();

		const response = await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify(bodyWithoutName),
		});

		expect(response.status).toBe(400);
		expect(projectService.createProject).not.toHaveBeenCalled();
	});

	it("returns 400 when the request body is not valid JSON", async () => {
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		const response = await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: "not-json",
		});

		expect(response.status).toBe(400);
		expect(projectService.createProject).not.toHaveBeenCalled();
	});

	it("returns 401 when the request has no authentication", async () => {
		getSessionMock.mockResolvedValue(null);
		const projectService = createProjectServiceMock();
		const app = createTestApp(projectService);

		const response = await app.request("/api/v1/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(validBody()),
		});

		expect(response.status).toBe(401);
		expect(projectService.createProject).not.toHaveBeenCalled();
	});

	it("returns 403 when the service throws an AccessDeniedError", async () => {
		const projectService = createProjectServiceMock();
		projectService.createProject.mockRejectedValueOnce(
			new AccessDeniedError("You are not a member of this organization"),
		);
		const app = createTestApp(projectService);

		const response = await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify(validBody()),
		});

		expect(response.status).toBe(403);
	});

	it("returns 403 when the service throws a 403 HTTPException", async () => {
		const projectService = createProjectServiceMock();
		projectService.createProject.mockRejectedValueOnce(
			new HTTPException(403, { message: "You are not a member of this organization" }),
		);
		const app = createTestApp(projectService);

		const response = await app.request("/api/v1/projects", {
			method: "POST",
			headers: { ...authHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify(validBody()),
		});

		expect(response.status).toBe(403);
	});
});
