import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createMockDb } from "@synk-ai/test-utils";
import { HTTPException } from "hono/http-exception";
import type { AppDependencies } from "../composition/dependencies";
import { AccessDeniedError } from "../domain/errors/access-denied-error";
import type { DashboardServiceContract } from "../domain/services/index";
import { createLogger } from "../logger";

const mockDb = createMockDb();

mock.module("@synk-ai/db", () => ({ db: mockDb }));

const SESSION_TOKEN = "session-token";
const INSTALLATION_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "user-1";
const NOW = new Date("2026-02-19T20:00:00.000Z");
const NOW_ISO = NOW.toISOString();

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

const createDashboardServiceMock = () => {
	const patchRepository = mock(
		async (input: Parameters<DashboardServiceContract["patchRepository"]>[0]) => ({
			id: input.repositoryId,
			installationId: INSTALLATION_ID,
			fullName: "acme/docs",
			defaultBranch: "main",
			status: "active",
			isActive: input.isActive ?? true,
			docsConfig: { docs: { path: "docs" } },
			createdAt: NOW,
			updatedAt: NOW,
		}),
	);

	const listInstallationRepositories = mock(async () => ({
		items: [
			{
				id: REPOSITORY_ID,
				installationId: INSTALLATION_ID,
				fullName: "acme/docs",
				defaultBranch: "main",
				status: "active",
				isActive: true,
				docsConfig: { docs: { path: "docs" } },
				updatedAt: NOW,
			},
		],
		total: 1,
	}));

	const listRepositoryRuns = mock(async () => ({
		items: [
			{
				id: RUN_ID,
				status: "completed",
				triggerType: "manual",
				triggerRef: "refs/heads/main",
				triggerCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				docsAffected: true,
				docPrUrl: "https://github.com/acme/docs/pull/12",
				error: null,
				createdAt: NOW,
				startedAt: NOW,
				completedAt: NOW,
			},
		],
		total: 1,
	}));

	const triggerManualRun = mock(
		async (input: Parameters<DashboardServiceContract["triggerManualRun"]>[0]) => ({
			repositoryId: input.repositoryId,
			triggerType: "manual",
			triggerRef: input.ref ?? "refs/heads/main",
			triggerCommitSha: input.commitSha,
			accepted: true,
		}),
	);

	const getRunDetail = mock(async () => ({
		id: RUN_ID,
		repositoryId: REPOSITORY_ID,
		status: "completed",
		triggerType: "manual",
		triggerRef: "refs/heads/main",
		triggerCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		triggerMergeRequestNumber: null,
		triggerMeta: {},
		docsAffected: true,
		docPrNumber: 12,
		docPrUrl: "https://github.com/acme/docs/pull/12",
		tokenUsage: { total: { prompt: 1, completion: 2, total: 3 } },
		error: null,
		attemptCount: 1,
		result: {
			triage: { reasoning: "Docs are stale compared to code change" },
		},
		queuedAt: NOW,
		startedAt: NOW,
		completedAt: NOW,
		createdAt: NOW,
		updatedAt: NOW,
	}));

	return {
		patchRepository,
		listInstallationRepositories,
		listRepositoryRuns,
		triggerManualRun,
		getRunDetail,
	};
};

const createTestApp = (dashboardService: DashboardServiceContract) => {
	const logger = createLogger("silent", false);
	const dependencies: AppDependencies = {
		dashboardService,
		integrationService: {
			initiateInstallation: mock(async () => {
				throw new Error(
					"integrationService.initiateInstallation should not be called in dashboard tests",
				);
			}),
			completeInstallation: mock(async () => {
				throw new Error(
					"integrationService.completeInstallation should not be called in dashboard tests",
				);
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

describe("dashboard routes", () => {
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

	it("lists repositories for an installation", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/repositories/installations/${INSTALLATION_ID}`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: Array<{ id: string; updatedAt: string }>;
			pagination: { page: number; pageSize: number; total: number; totalPages: number };
		};

		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.id).toBe(REPOSITORY_ID);
		expect(body.data[0]?.updatedAt).toBe(NOW_ISO);
		expect(body.pagination).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
		expect(dashboardService.listInstallationRepositories).toHaveBeenCalledWith({
			installationId: INSTALLATION_ID,
			userId: USER_ID,
			pagination: { page: 1, pageSize: 10 },
		});
	});

	it("coerces installation repository pagination query params from strings", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(
			`/api/v1/repositories/installations/${INSTALLATION_ID}?page=2&pageSize=25`,
			{ headers: authHeaders() },
		);

		expect(response.status).toBe(200);
		expect(dashboardService.listInstallationRepositories).toHaveBeenCalledWith({
			installationId: INSTALLATION_ID,
			userId: USER_ID,
			pagination: { page: 2, pageSize: 25 },
		});
	});

	it("updates repository activation", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/repositories/${REPOSITORY_ID}`, {
			method: "PATCH",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({ isActive: false }),
		});

		expect(response.status).toBe(200);
		expect(dashboardService.patchRepository).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
			isActive: false,
		});

		const body = (await response.json()) as {
			data: { isActive: boolean; createdAt: string; updatedAt: string };
		};
		expect(body.data.isActive).toBe(false);
		expect(body.data.createdAt).toBe(NOW_ISO);
		expect(body.data.updatedAt).toBe(NOW_ISO);
	});

	it("lists repository runs", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: Array<{ id: string; createdAt: string }>;
			pagination: { total: number };
		};
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.id).toBe(RUN_ID);
		expect(body.data[0]?.createdAt).toBe(NOW_ISO);
		expect(body.pagination.total).toBe(1);
		expect(dashboardService.listRepositoryRuns).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
			filter: { page: 1, pageSize: 10 },
		});
	});

	it("coerces repository runs pagination query params from strings", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(
			`/api/v1/runs/repositories/${REPOSITORY_ID}?page=3&pageSize=50`,
			{
				headers: authHeaders(),
			},
		);

		expect(response.status).toBe(200);
		expect(dashboardService.listRepositoryRuns).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
			filter: { page: 3, pageSize: 50 },
		});
	});

	it("parses repeated run status filters from query string", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(
			`/api/v1/runs/repositories/${REPOSITORY_ID}?page=1&pageSize=10&status=running&status=failed`,
			{
				headers: authHeaders(),
			},
		);

		expect(response.status).toBe(200);
		expect(dashboardService.listRepositoryRuns).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
			filter: { page: 1, pageSize: 10, status: ["running", "failed"] },
		});
	});

	it("returns run detail", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/${RUN_ID}`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: { id: string; docPrUrl: string; queuedAt: string; createdAt: string };
		};
		expect(body.data.id).toBe(RUN_ID);
		expect(body.data.docPrUrl).toBe("https://github.com/acme/docs/pull/12");
		expect(body.data.queuedAt).toBe(NOW_ISO);
		expect(body.data.createdAt).toBe(NOW_ISO);
		expect(dashboardService.getRunDetail).toHaveBeenCalledWith(RUN_ID, USER_ID);
	});

	it("triggers a manual run for a specific commit", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const commitSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`, {
			method: "POST",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({ commitSha }),
		});

		expect(response.status).toBe(200);
		expect(dashboardService.triggerManualRun).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
			commitSha,
		});

		const body = (await response.json()) as {
			data: {
				repositoryId: string;
				triggerType: string;
				triggerRef: string;
				triggerCommitSha: string;
				accepted: boolean;
			};
		};
		expect(body.data).toEqual({
			repositoryId: REPOSITORY_ID,
			triggerType: "manual",
			triggerRef: "refs/heads/main",
			triggerCommitSha: commitSha,
			accepted: true,
		});
	});

	it("returns 401 without authentication", async () => {
		getSessionMock.mockResolvedValue(null);
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`);

		expect(response.status).toBe(401);
	});

	it("returns 403 when service denies repository access", async () => {
		const dashboardService = createDashboardServiceMock();
		dashboardService.listRepositoryRuns.mockRejectedValueOnce(
			new HTTPException(403, { message: "You do not have access to this repository" }),
		);
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(403);
	});

	it("returns 403 when service throws AccessDeniedError", async () => {
		const dashboardService = createDashboardServiceMock();
		dashboardService.listRepositoryRuns.mockRejectedValueOnce(
			new AccessDeniedError("You do not have access to this repository"),
		);
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(403);
	});

	it("returns 400 for invalid manual run payload", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`, {
			method: "POST",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({ commitSha: "not-a-sha" }),
		});

		expect(response.status).toBe(400);
		expect(dashboardService.triggerManualRun).not.toHaveBeenCalled();
	});

	it("returns 400 for malformed JSON in repository update request", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/repositories/${REPOSITORY_ID}`, {
			method: "PATCH",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: "{",
		});

		expect(response.status).toBe(400);
		expect(dashboardService.patchRepository).not.toHaveBeenCalled();
	});

	it("returns 400 for empty repository update payload", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/repositories/${REPOSITORY_ID}`, {
			method: "PATCH",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({}),
		});

		expect(response.status).toBe(400);
		expect(dashboardService.patchRepository).not.toHaveBeenCalled();
	});

	it("returns 400 for unknown fields in repository update payload", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/repositories/${REPOSITORY_ID}`, {
			method: "PATCH",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({ isActive: true, unexpected: "value" }),
		});

		expect(response.status).toBe(400);
		expect(dashboardService.patchRepository).not.toHaveBeenCalled();
	});

	it("returns 400 for malformed JSON in manual run request", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`, {
			method: "POST",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: "{",
		});

		expect(response.status).toBe(400);
		expect(dashboardService.triggerManualRun).not.toHaveBeenCalled();
	});

	it("returns 400 for unknown fields in manual run payload", async () => {
		const dashboardService = createDashboardServiceMock();
		const app = createTestApp(dashboardService);

		const response = await app.request(`/api/v1/runs/repositories/${REPOSITORY_ID}`, {
			method: "POST",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				unexpected: "value",
			}),
		});

		expect(response.status).toBe(400);
		expect(dashboardService.triggerManualRun).not.toHaveBeenCalled();
	});
});
