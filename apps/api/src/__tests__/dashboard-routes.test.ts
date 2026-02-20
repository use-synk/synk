import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@synk-ai/db";
import type { MockDb } from "@synk-ai/test-utils";
import { createApp } from "../app.js";
import { createLogger } from "../logger.js";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type {
	GitHubInstallationRepository,
	ListInstallationRepositories,
} from "../modules/webhooks/github/index.js";

const SESSION_TOKEN = "session-token";
const INSTALLATION_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "user-1";
const NOW = new Date("2026-02-19T20:00:00.000Z");
const NOW_ISO = NOW.toISOString();

// The mock factory owns the MockDb instance; we import db back from the mocked module
// so there is no module-level variable in TDZ when the factory executes.
vi.mock("@synk-ai/db", async () => {
	const { createMockDb } = await import("@synk-ai/test-utils");
	return { db: createMockDb() };
});

// At runtime db is the MockDb created above; the cast makes vitest mock APIs available.
const mockDb = db as unknown as MockDb;

// vi.hoisted runs before imports — only inline values and vi.fn() are safe here.
const { getSessionMock } = vi.hoisted(() => ({
	getSessionMock: vi.fn(async () => ({
		user: { id: "user-1" },
		session: {
			token: "session-token",
			userId: "user-1",
			expiresAt: new Date("2099-01-01T00:00:00.000Z"),
		},
	})),
}));

vi.mock("../modules/auth/auth.service.js", () => ({
	createAuthService: () => ({
		auth: {
			api: {
				getSession: getSessionMock,
			},
		},
	}),
}));

const createTestApp = (enqueueAnalyzeChanges: AnalyzeChangesEnqueuer) => {
	const logger = createLogger("silent", false);
	const listInstallationRepositories: ListInstallationRepositories = vi.fn(
		async (): Promise<readonly GitHubInstallationRepository[]> => [],
	);

	return createApp({
		logger,
		db: mockDb,
		enqueueAnalyzeChanges,
		listInstallationRepositories,
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
		},
	});
};

const authHeaders = (): Record<string, string> => ({
	authorization: `Bearer ${SESSION_TOKEN}`,
});

describe("dashboard routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		getSessionMock.mockResolvedValue({
			user: { id: USER_ID },
			session: {
				token: SESSION_TOKEN,
				userId: USER_ID,
				expiresAt: new Date("2099-01-01T00:00:00.000Z"),
			},
		});

		mockDb.providerInstallation.findFirst.mockResolvedValue({ id: INSTALLATION_ID });

		mockDb.providerRepository.findFirst.mockResolvedValue({ id: REPOSITORY_ID });
		mockDb.providerRepository.count.mockResolvedValue(1);
		mockDb.providerRepository.findMany.mockResolvedValue([
			{
				id: REPOSITORY_ID,
				installationId: INSTALLATION_ID,
				fullName: "acme/docs",
				defaultBranch: "main",
				status: "active" as const,
				isActive: true,
				docsConfig: { docs: { path: "docs" } },
				updatedAt: NOW,
			},
		]);
		mockDb.providerRepository.update.mockImplementation(
			async ({ where, data }: { where: { id: string }; data: { isActive?: boolean } }) => ({
				id: where.id,
				installationId: INSTALLATION_ID,
				fullName: "acme/docs",
				defaultBranch: "main",
				status: "active" as const,
				isActive: data.isActive ?? true,
				docsConfig: { docs: { path: "docs" } },
				createdAt: NOW,
				updatedAt: NOW,
			}),
		);
		mockDb.providerRepository.findUnique.mockResolvedValue({
			status: "active" as const,
			isActive: true,
			defaultBranch: "main",
			installationId: INSTALLATION_ID,
		});

		mockDb.analysisRun.count.mockResolvedValue(1);
		mockDb.analysisRun.findMany.mockResolvedValue([
			{
				id: RUN_ID,
				status: "completed" as const,
				triggerType: "manual" as const,
				triggerRef: "refs/heads/main",
				triggerCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				docsAffected: true,
				docPrUrl: "https://github.com/acme/docs/pull/12",
				error: null,
				createdAt: NOW,
				startedAt: NOW,
				completedAt: NOW,
			},
		]);
		mockDb.analysisRun.findFirst.mockResolvedValue({ id: RUN_ID });
		mockDb.analysisRun.findUnique.mockResolvedValue({
			id: RUN_ID,
			repositoryId: REPOSITORY_ID,
			status: "completed" as const,
			triggerType: "manual" as const,
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
		});
	});

	it("lists repositories for an installation", async () => {
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const response = await app.request(
			`/api/v1/dashboard/installations/${INSTALLATION_ID}/repos`,
			{ headers: authHeaders() },
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: Array<{ id: string; updatedAt: string }>;
			pagination: { page: number; pageSize: number; total: number; totalPages: number };
		};

		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.id).toBe(REPOSITORY_ID);
		expect(body.data[0]?.updatedAt).toBe(NOW_ISO);
		expect(body.pagination).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
		expect(mockDb.providerRepository.findMany).toHaveBeenCalledOnce();
	});

	it("updates repository activation", async () => {
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const response = await app.request(`/api/v1/dashboard/repos/${REPOSITORY_ID}`, {
			method: "PATCH",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({ isActive: false }),
		});

		expect(response.status).toBe(200);
		expect(mockDb.providerRepository.update).toHaveBeenCalledWith({
			where: { id: REPOSITORY_ID },
			data: { isActive: false },
		});

		const body = (await response.json()) as {
			data: { isActive: boolean; createdAt: string; updatedAt: string };
		};
		expect(body.data.isActive).toBe(false);
		expect(body.data.createdAt).toBe(NOW_ISO);
		expect(body.data.updatedAt).toBe(NOW_ISO);
	});

	it("lists repository runs", async () => {
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const response = await app.request(`/api/v1/dashboard/repos/${REPOSITORY_ID}/runs`, {
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
		expect(mockDb.analysisRun.findMany).toHaveBeenCalledOnce();
	});

	it("returns run detail", async () => {
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const response = await app.request(`/api/v1/dashboard/runs/${RUN_ID}`, {
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
	});

	it("enqueues a manual run for a specific commit", async () => {
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const commitSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		const response = await app.request(`/api/v1/dashboard/repos/${REPOSITORY_ID}/runs`, {
			method: "POST",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({ commitSha }),
		});

		expect(response.status).toBe(200);
		expect(enqueueAnalyzeChanges).toHaveBeenCalledWith({
			installationId: INSTALLATION_ID,
			repositoryId: REPOSITORY_ID,
			trigger: {
				type: "manual",
				ref: "refs/heads/main",
				commitSha,
			},
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
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const response = await app.request(`/api/v1/dashboard/repos/${REPOSITORY_ID}/runs`);

		expect(response.status).toBe(401);
	});

	it("returns 403 when repository access is denied", async () => {
		mockDb.providerRepository.findFirst.mockResolvedValueOnce(null);
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const response = await app.request(`/api/v1/dashboard/repos/${REPOSITORY_ID}/runs`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(403);
	});

	it("returns 400 for invalid manual run payload", async () => {
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(enqueueAnalyzeChanges);

		const response = await app.request(`/api/v1/dashboard/repos/${REPOSITORY_ID}/runs`, {
			method: "POST",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({ commitSha: "not-a-sha" }),
		});

		expect(response.status).toBe(400);
	});
});
