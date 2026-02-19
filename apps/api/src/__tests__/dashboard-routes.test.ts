import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createLogger } from "../logger.js";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type { DashboardDatabase } from "../routes/dashboard.js";
import type {
	GitHubInstallationRepository,
	ListInstallationRepositories,
	WebhookDatabase,
} from "../routes/github-webhooks.js";

const SESSION_TOKEN = "session-token";
const INSTALLATION_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "user-1";

type MockDatabase = WebhookDatabase & DashboardDatabase;

const createMockDatabase = (): MockDatabase => {
	const now = new Date("2026-02-19T20:00:00.000Z");
	return {
		providerInstallation: {
			findUnique: vi.fn(async () => null),
			upsert: vi.fn(async () => ({ id: "installation-1" })),
			updateMany: vi.fn(async () => ({ count: 1 })),
			findFirst: vi.fn(async () => ({ id: INSTALLATION_ID })),
		},
		providerRepository: {
			upsert: vi.fn(async () => ({})),
			findFirst: vi.fn(async () => ({
				id: REPOSITORY_ID,
				installationId: INSTALLATION_ID,
				defaultBranch: "main",
				status: "active" as const,
				isActive: true,
				docsConfig: {},
				updatedAt: now,
			})),
			updateMany: vi.fn(async () => ({ count: 1 })),
			count: vi.fn(async () => 1),
			findMany: vi.fn(async () => [
				{
					id: REPOSITORY_ID,
					installationId: INSTALLATION_ID,
					fullName: "acme/docs",
					defaultBranch: "main",
					status: "active" as const,
					isActive: true,
					docsConfig: { docs: { path: "docs" } },
					updatedAt: now,
				},
			]),
			update: vi.fn(async () => ({
				id: REPOSITORY_ID,
				installationId: INSTALLATION_ID,
				defaultBranch: "main",
				status: "active" as const,
				isActive: false,
				docsConfig: { docs: { path: "documentation" } },
				updatedAt: now,
			})),
		},
		session: {
			findFirst: vi.fn(async () => ({
				token: SESSION_TOKEN,
				userId: USER_ID,
				expiresAt: new Date("2099-01-01T00:00:00.000Z"),
			})),
		},
		analysisRun: {
			count: vi.fn(async () => 1),
			findMany: vi.fn(async () => [
				{
					id: RUN_ID,
					status: "completed" as const,
					triggerType: "manual" as const,
					triggerRef: "refs/heads/main",
					triggerCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					docsAffected: true,
					docPrUrl: "https://github.com/acme/docs/pull/12",
					error: null,
					createdAt: now,
					startedAt: now,
					completedAt: now,
				},
			]),
			findFirst: vi.fn(async () => ({
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
					triage: {
						reasoning: "Docs are stale compared to code change",
					},
					generation: [
						{
							path: "docs/index.md",
							reasoning: "Updated installation instructions",
						},
					],
				},
				queuedAt: now,
				startedAt: now,
				completedAt: now,
				createdAt: now,
				updatedAt: now,
			})),
		},
	};
};

const createTestApp = (db: MockDatabase, enqueueAnalyzeChanges: AnalyzeChangesEnqueuer) => {
	const logger = createLogger("silent", false);
	const listInstallationRepositories: ListInstallationRepositories = vi.fn(
		async (): Promise<readonly GitHubInstallationRepository[]> => [],
	);

	return createApp({
		logger,
		db,
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
	it("lists repositories for an installation", async () => {
		const db = createMockDatabase();
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(
			`/api/installations/${INSTALLATION_ID}/repos?page=1&page_size=10`,
			{ headers: authHeaders() },
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as { data: unknown[]; pagination: { total: number } };
		expect(body.data).toHaveLength(1);
		expect(body.pagination.total).toBe(1);
	});

	it("updates repository activation and docs config", async () => {
		const db = createMockDatabase();
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(`/api/repos/${REPOSITORY_ID}`, {
			method: "PATCH",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				is_active: false,
				docs_config: { docs: { path: "documentation" } },
			}),
		});

		expect(response.status).toBe(200);
		expect(db.providerRepository.update).toHaveBeenCalledOnce();
	});

	it("lists runs with status filtering", async () => {
		const db = createMockDatabase();
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(
			`/api/repos/${REPOSITORY_ID}/runs?status=completed,failed&page=1&page_size=5`,
			{ headers: authHeaders() },
		);

		expect(response.status).toBe(200);
		expect(db.analysisRun.findMany).toHaveBeenCalledOnce();
	});

	it("returns run detail with ai reasoning and pr link", async () => {
		const db = createMockDatabase();
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(`/api/runs/${RUN_ID}`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			data: {
				pr_link: string;
				ai_reasoning: { triage: string | null; generation: { path: string; reasoning: string }[] };
			};
		};
		expect(body.data.pr_link).toBe("https://github.com/acme/docs/pull/12");
		expect(body.data.ai_reasoning.triage).toBe("Docs are stale compared to code change");
	});

	it("enqueues a manual run for a specific commit", async () => {
		const db = createMockDatabase();
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(`/api/repos/${REPOSITORY_ID}/runs`, {
			method: "POST",
			headers: {
				...authHeaders(),
				"content-type": "application/json",
			},
			body: JSON.stringify({
				commit_sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			}),
		});

		expect(response.status).toBe(202);
		expect(enqueueAnalyzeChanges).toHaveBeenCalledWith({
			installationId: INSTALLATION_ID,
			repositoryId: REPOSITORY_ID,
			trigger: {
				type: "manual",
				ref: "refs/heads/main",
				commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			},
		});
	});

	it("returns 401 without authentication", async () => {
		const db = createMockDatabase();
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(`/api/repos/${REPOSITORY_ID}/runs`);

		expect(response.status).toBe(401);
	});

	it("returns 403 when repository access is denied", async () => {
		const db = createMockDatabase();
		db.providerRepository.findFirst = vi.fn(async () => null);
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(`/api/repos/${REPOSITORY_ID}/runs`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(403);
	});

	it("returns 400 for invalid run status filters", async () => {
		const db = createMockDatabase();
		const enqueueAnalyzeChanges = vi.fn(async () => undefined);
		const app = createTestApp(db, enqueueAnalyzeChanges);

		const response = await app.request(`/api/repos/${REPOSITORY_ID}/runs?status=unknown`, {
			headers: authHeaders(),
		});

		expect(response.status).toBe(400);
	});
});
