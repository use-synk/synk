import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@synk-ai/db";
import type { MockDb } from "@synk-ai/test-utils";

vi.mock("@synk-ai/db", async () => {
	const { createMockDb } = await import("@synk-ai/test-utils");
	return { db: createMockDb() };
});

const mockDb = db as unknown as MockDb;

vi.mock("../modules/auth/auth.service.js", () => ({
	createAuthService: () => ({
		auth: { api: { getSession: vi.fn(async () => null) } },
	}),
}));

import { createApp } from "../app.js";
import { createLogger } from "../logger.js";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type {
	GitHubInstallationRepository,
	ListInstallationRepositories,
} from "../modules/webhooks/github/index.js";

const WEBHOOK_SECRET = "test-webhook-secret";

const FIXTURES_DIR = new URL("./fixtures/github/", import.meta.url);

const readFixture = (name: string): Record<string, unknown> => {
	const parsed = JSON.parse(readFileSync(fileURLToPath(new URL(name, FIXTURES_DIR)), "utf8"));
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error(`Fixture ${name} must contain a JSON object`);
	}
	return parsed as Record<string, unknown>;
};

const createSignature = (body: string): string =>
	`sha256=${createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex")}`;

const makeApp = (
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer,
	listInstallationRepositories: ListInstallationRepositories,
) => {
	const logger = createLogger("silent", false);

	return createApp({
		logger,
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
			GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
			GITHUB_WEBHOOK_ORGANIZATION_ID: "org-default",
		},
	});
};

const dispatchWebhook = async (
	app: ReturnType<typeof makeApp>,
	event: string,
	payload: Record<string, unknown>,
	options: { signature?: string; requestId?: string } = {},
): Promise<Response> => {
	const body = JSON.stringify(payload);
	const signature = options.signature ?? createSignature(body);
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"x-github-event": event,
		"x-hub-signature-256": signature,
	};
	if (options.requestId !== undefined) {
		headers["x-request-id"] = options.requestId;
	}

	return app.request("/api/webhooks/github", {
		method: "POST",
		headers,
		body,
	});
};

describe("POST /api/webhooks/github", () => {
	let enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	let enqueueMock: ReturnType<typeof vi.fn>;
	let listInstallationRepositoriesMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		enqueueMock = vi.fn(async () => undefined);
		enqueueAnalyzeChanges = enqueueMock;
		listInstallationRepositoriesMock = vi.fn(
			async (): Promise<readonly GitHubInstallationRepository[]> => [],
		);

		mockDb.providerInstallation.findUnique.mockResolvedValue(null);
		mockDb.providerInstallation.upsert.mockResolvedValue({ id: "installation-1" });
		mockDb.providerInstallation.updateMany.mockResolvedValue({ count: 1 });
		mockDb.providerRepository.upsert.mockResolvedValue({});
		mockDb.providerRepository.findFirst.mockResolvedValue({
			id: "repo-1",
			installationId: "installation-1",
			defaultBranch: "main",
		});
		mockDb.providerRepository.updateMany.mockResolvedValue({ count: 1 });
	});

	it("rejects requests with missing signature", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await app.request("/api/webhooks/github", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-github-event": "push",
			},
			body: JSON.stringify(readFixture("push-main.json")),
		});

		expect(response.status).toBe(401);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("creates or updates installations for installation events", async () => {
		const repositories: readonly GitHubInstallationRepository[] = [
			{
				id: 54321,
				name: "repo",
				full_name: "acme/repo",
				default_branch: "main",
				owner: { login: "acme" },
			},
		];
		listInstallationRepositoriesMock.mockResolvedValue(repositories);
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"installation",
			readFixture("installation-created.json"),
		);

		expect(response.status).toBe(200);
		expect(mockDb.providerInstallation.findUnique).toHaveBeenCalledOnce();
		expect(mockDb.providerInstallation.upsert).toHaveBeenCalledOnce();
		expect(listInstallationRepositoriesMock).toHaveBeenCalledWith(12345);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledTimes(1);
		expect(mockDb.providerInstallation.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					providerAccountId: "9876",
					accountLogin: "acme",
					accountType: "Organization",
				}),
				update: expect.objectContaining({
					providerAccountId: "9876",
					accountLogin: "acme",
					accountType: "Organization",
				}),
			}),
		);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("enqueues for push events on active repository default branch", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"));

		expect(response.status).toBe(200);
		expect(mockDb.providerRepository.findFirst).toHaveBeenCalledOnce();
		expect(enqueueMock).toHaveBeenCalledWith({
			installationId: "installation-1",
			repositoryId: "repo-1",
			trigger: {
				type: "push",
				ref: "refs/heads/main",
				commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			},
		});
	});

	it("does not enqueue push events for non-default branches", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const payload = readFixture("push-main.json");
		payload.ref = "refs/heads/feature-x";

		const response = await dispatchWebhook(app, "push", payload);

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("does not enqueue push events for deleted branches", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const payload = readFixture("push-main.json");
		payload.after = "0000000000000000000000000000000000000000";

		const response = await dispatchWebhook(app, "push", payload);

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("enqueues for merged pull_request events targeting active repo default branch", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"pull_request",
			readFixture("pull-request-merged.json"),
		);

		expect(response.status).toBe(200);
		expect(enqueueMock).toHaveBeenCalledWith({
			installationId: "installation-1",
			repositoryId: "repo-1",
			trigger: {
				type: "merge",
				ref: "refs/heads/main",
				commitSha: "cccccccccccccccccccccccccccccccccccccccc",
				prNumber: 42,
			},
		});
	});

	it("marks installations as deleted for installation.deleted", async () => {
		const payload = readFixture("installation-created.json");
		payload.action = "deleted";
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(app, "installation", payload);

		expect(response.status).toBe(200);
		expect(mockDb.providerInstallation.updateMany).toHaveBeenCalledOnce();
		expect(mockDb.providerRepository.updateMany).toHaveBeenCalledOnce();
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("upserts repositories for installation_repositories.added events", async () => {
		mockDb.providerInstallation.findUnique.mockResolvedValueOnce({
			id: "installation-1",
			organizationId: "org-default",
		});
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"installation_repositories",
			readFixture("installation-repositories-added.json"),
		);

		expect(response.status).toBe(200);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledTimes(1);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					providerRepositoryId: "67890",
					fullName: "acme/docs",
					status: "active",
					isActive: true,
				}),
			}),
		);
	});

	it("deactivates repositories for installation_repositories.removed events", async () => {
		mockDb.providerInstallation.findUnique.mockResolvedValueOnce({
			id: "installation-1",
			organizationId: "org-default",
		});
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"installation_repositories",
			readFixture("installation-repositories-removed.json"),
		);

		expect(response.status).toBe(200);
		expect(mockDb.providerRepository.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					providerRepositoryId: { in: ["67890"] },
				}),
				data: {
					status: "removed",
					isActive: false,
				},
			}),
		);
	});

	it("deactivates repositories for removed events with id-only payload entries", async () => {
		mockDb.providerInstallation.findUnique.mockResolvedValueOnce({
			id: "installation-1",
			organizationId: "org-default",
		});
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"installation_repositories",
			readFixture("installation-repositories-removed-id-only.json"),
		);

		expect(response.status).toBe(200);
		expect(mockDb.providerRepository.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					providerRepositoryId: { in: ["67890"] },
				}),
			}),
		);
	});

	it("hydrates added repositories when webhook payload omits repository details", async () => {
		mockDb.providerInstallation.findUnique.mockResolvedValueOnce({
			id: "installation-1",
			organizationId: "org-default",
		});
		listInstallationRepositoriesMock.mockResolvedValue([
			{
				id: 67890,
				name: "docs",
				full_name: "acme/docs",
				default_branch: "main",
				owner: { login: "acme" },
			},
		]);
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"installation_repositories",
			readFixture("installation-repositories-added-partial.json"),
		);

		expect(response.status).toBe(200);
		expect(listInstallationRepositoriesMock).toHaveBeenCalledWith(12345);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					providerRepositoryId: "67890",
					fullName: "acme/docs",
				}),
			}),
		);
	});

	it("returns 422 when added repository details cannot be resolved", async () => {
		mockDb.providerInstallation.findUnique.mockResolvedValueOnce({
			id: "installation-1",
			organizationId: "org-default",
		});
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"installation_repositories",
			readFixture("installation-repositories-added-partial.json"),
		);

		expect(response.status).toBe(422);
		expect(mockDb.providerRepository.upsert).not.toHaveBeenCalled();
	});

	it("persists resolvable repositories before returning 422 for unresolved ones", async () => {
		mockDb.providerInstallation.findUnique.mockResolvedValueOnce({
			id: "installation-1",
			organizationId: "org-default",
		});
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(app, "installation_repositories", {
			action: "added",
			installation: { id: 12345 },
			repositories_added: [
				{
					id: 111,
					name: "docs",
					full_name: "acme/docs",
					default_branch: "main",
					owner: { login: "acme" },
				},
				{ id: 222 },
			],
		});

		expect(response.status).toBe(422);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledTimes(1);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					providerRepositoryId: "111",
					fullName: "acme/docs",
				}),
			}),
		);
	});

	it("handles replayed installation_repositories.added events idempotently", async () => {
		mockDb.providerInstallation.findUnique.mockResolvedValue({
			id: "installation-1",
			organizationId: "org-default",
		});
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const payload = readFixture("installation-repositories-added.json");

		const firstResponse = await dispatchWebhook(app, "installation_repositories", payload);
		const secondResponse = await dispatchWebhook(app, "installation_repositories", payload);

		expect(firstResponse.status).toBe(200);
		expect(secondResponse.status).toBe(200);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledTimes(2);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("returns 400 when X-GitHub-Event header is missing", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const payload = readFixture("push-main.json");
		const body = JSON.stringify(payload);
		const signature = createSignature(body);
		const response = await app.request("/api/webhooks/github", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-hub-signature-256": signature,
			},
			body,
		});

		expect(response.status).toBe(400);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("returns 400 for invalid JSON payload", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const body = "{";
		const signature = createSignature(body);
		const response = await app.request("/api/webhooks/github", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-github-event": "push",
				"x-hub-signature-256": signature,
			},
			body,
		});

		expect(response.status).toBe(400);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("does not enqueue when pull_request is closed but not merged", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const payload = readFixture("pull-request-merged.json");
		payload.pull_request = {
			merged: false,
			base: { ref: "main" },
			head: { sha: "dddddddddddddddddddddddddddddddddddddddd" },
		};

		const response = await dispatchWebhook(app, "pull_request", payload);

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("preserves a valid incoming x-request-id header", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const requestId = "cd3446de-f91f-4033-bbd2-1568366e6837";
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"), {
			requestId,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-request-id")).toBe(requestId);
	});

	it("returns 200 for unhandled event types without enqueueing", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(app, "issues", { action: "opened" });

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("does not enqueue when repository is inactive or unknown", async () => {
		mockDb.providerRepository.findFirst.mockResolvedValueOnce(null);
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"));

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("ignores installation create events without a resolvable organization", async () => {
		const logger = createLogger("silent", false);
		const app = createApp({
			logger,
			enqueueAnalyzeChanges,
			listInstallationRepositories: listInstallationRepositoriesMock,
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
				GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
			},
		});

		const response = await dispatchWebhook(
			app,
			"installation",
			readFixture("installation-created.json"),
		);

		expect(response.status).toBe(200);
		expect(mockDb.providerInstallation.upsert).not.toHaveBeenCalled();
		expect(enqueueMock).not.toHaveBeenCalled();
	});
});
