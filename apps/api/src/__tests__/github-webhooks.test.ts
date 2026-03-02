import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type MockDb, createMockDb } from "@synk-ai/test-utils";
import { HTTPException } from "hono/http-exception";

const mockDb: MockDb = createMockDb();

mock.module("@synk-ai/db", () => ({ db: mockDb }));

mock.module("../modules/auth/auth.service.js", () => ({
	createAuthService: () => ({
		auth: { api: { getSession: mock(async () => null) } },
	}),
}));

const { createApp } = await import("../app");
import type { AppDependencies } from "../composition/dependencies";
import { createLogger } from "../logger";
import type {
	GitHubInstallationRepository,
	ListInstallationRepositories,
} from "../modules/webhooks/github/index";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes";

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

const createNoopDependencies = (): AppDependencies => ({
	dashboardService: {
		patchRepository: mock(async () => {
			throw new Error("dashboardService.patchRepository should not be called in webhook tests");
		}),
		listInstallationRepositories: mock(async () => {
			throw new Error(
				"dashboardService.listInstallationRepositories should not be called in webhook tests",
			);
		}),
		listRepositoryRuns: mock(async () => {
			throw new Error("dashboardService.listRepositoryRuns should not be called in webhook tests");
		}),
		triggerManualRun: mock(async () => {
			throw new Error("dashboardService.triggerManualRun should not be called in webhook tests");
		}),
		getRunDetail: mock(async () => {
			throw new Error("dashboardService.getRunDetail should not be called in webhook tests");
		}),
		getOrganizationSetupStatus: mock(async () => {
			throw new Error(
				"dashboardService.getOrganizationSetupStatus should not be called in webhook tests",
			);
		}),
		listUserOrganizations: mock(async () => {
			throw new Error(
				"dashboardService.listUserOrganizations should not be called in webhook tests",
			);
		}),
	},
	integrationService: {
		initiateInstallation: mock(async () => {
			throw new Error(
				"integrationService.initiateInstallation should not be called in webhook tests",
			);
		}),
		completeInstallation: mock(async () => {
			throw new Error(
				"integrationService.completeInstallation should not be called in webhook tests",
			);
		}),
	},
	// Overridden per-test via makeApp's listInstallationRepositories argument.
	listInstallationRepositories: mock(async () => []),
});

const makeApp = (
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer,
	listInstallationRepositories: ListInstallationRepositories,
) => {
	const logger = createLogger("silent", false);
	const dependencies = createNoopDependencies();

	return createApp({
		logger,
		enqueueAnalyzeChanges,
		dependencies,
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
			GITHUB_APP_SLUG: "test-app",
		},
	});
};

const dispatchWebhook = async (
	app: ReturnType<typeof makeApp>,
	event: string,
	payload: Record<string, unknown>,
	options: { signature?: string; requestId?: string; deliveryId?: string } = {},
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
	if (options.deliveryId !== undefined) {
		headers["x-github-delivery"] = options.deliveryId;
	}

	return app.request("/api/v1/webhooks/github", {
		method: "POST",
		headers,
		body,
	});
};

describe("POST /api/v1/webhooks/github", () => {
	let enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	let enqueueMock: ReturnType<typeof mock>;
	let listInstallationRepositoriesMock: ReturnType<typeof mock>;

	beforeEach(() => {
		mock.restore();
		mockDb.providerInstallation.findUnique.mockClear();
		mockDb.providerInstallation.upsert.mockClear();
		mockDb.providerInstallation.updateMany.mockClear();
		mockDb.providerRepository.upsert.mockClear();
		mockDb.providerRepository.findFirst.mockClear();
		mockDb.providerRepository.updateMany.mockClear();
		mockDb.webhookDelivery.upsert.mockClear();
		mockDb.webhookDelivery.updateMany.mockClear();

		enqueueMock = mock(async () => undefined);
		enqueueAnalyzeChanges = enqueueMock;
		listInstallationRepositoriesMock = mock(
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
		mockDb.webhookDelivery.upsert.mockResolvedValue({
			id: "delivery-1",
		});
		mockDb.webhookDelivery.updateMany.mockResolvedValue({ count: 1 });
	});

	it("rejects requests with missing signature", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await app.request("/api/v1/webhooks/github", {
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

	it("persists and completes webhook delivery logs when delivery id is provided", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"), {
			deliveryId: "delivery-123",
		});

		expect(response.status).toBe(200);
		expect(mockDb.webhookDelivery.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					provider_deliveryId: {
						provider: "github",
						deliveryId: "delivery-123",
					},
				},
				create: expect.objectContaining({
					eventType: "push",
					signatureValid: true,
					status: "received",
				}),
			}),
		);
		expect(mockDb.webhookDelivery.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { provider: "github", deliveryId: "delivery-123" },
				data: expect.objectContaining({ status: "processed" }),
			}),
		);
	});

	it("continues webhook processing when delivery log creation fails", async () => {
		mockDb.webhookDelivery.upsert.mockRejectedValueOnce(new Error("delivery log unavailable"));
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"), {
			deliveryId: "delivery-log-failure",
		});

		expect(response.status).toBe(200);
		expect(enqueueMock).toHaveBeenCalledOnce();
	});

	it("marks delivery log as failed for invalid signatures", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const payload = readFixture("push-main.json");
		const response = await dispatchWebhook(app, "push", payload, {
			deliveryId: "delivery-failed-1",
			signature: "sha256=deadbeef",
		});

		expect(response.status).toBe(401);
		expect(mockDb.webhookDelivery.upsert).toHaveBeenCalledOnce();
		expect(mockDb.webhookDelivery.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { provider: "github", deliveryId: "delivery-failed-1" },
				data: expect.objectContaining({
					status: "failed",
					error: "Invalid webhook signature",
				}),
			}),
		);
	});

	it("preserves the original error when markDelivery fails in catch path", async () => {
		mockDb.providerInstallation.findUnique.mockRejectedValueOnce(
			new HTTPException(418, { message: "upstream webhook failure" }),
		);
		mockDb.webhookDelivery.updateMany.mockRejectedValueOnce(
			new Error("delivery status update failed"),
		);
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const response = await dispatchWebhook(
			app,
			"installation_repositories",
			readFixture("installation-repositories-added.json"),
			{ deliveryId: "delivery-preserve-original-error" },
		);

		expect(response.status).toBe(418);
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
		mockDb.providerInstallation.findUnique.mockResolvedValueOnce({
			id: "installation-existing",
			organizationId: "organization-1",
		});
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

	it("returns ok:false when added repository details cannot be resolved", async () => {
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

		expect(response.status).toBe(200);
		expect(mockDb.providerRepository.upsert).not.toHaveBeenCalled();
		await expect(response.json()).resolves.toEqual({
			status: {
				ok: false,
				message: "Missing repository details for installation_repositories.added: 67890",
			},
		});
	});

	it("persists resolvable repositories and returns ok:false for unresolved ones", async () => {
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

		expect(response.status).toBe(200);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledTimes(1);
		expect(mockDb.providerRepository.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					providerRepositoryId: "111",
					fullName: "acme/docs",
				}),
			}),
		);
		await expect(response.json()).resolves.toEqual({
			status: {
				ok: false,
				message: "Missing repository details for installation_repositories.added: 222",
			},
		});
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
		const response = await app.request("/api/v1/webhooks/github", {
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
		const response = await app.request("/api/v1/webhooks/github", {
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

	it("returns 400 for JSON array payload", async () => {
		const app = makeApp(enqueueAnalyzeChanges, listInstallationRepositoriesMock);
		const body = "[]";
		const signature = createSignature(body);
		const response = await app.request("/api/v1/webhooks/github", {
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
		const dependencies = createNoopDependencies();
		const app = createApp({
			logger,
			enqueueAnalyzeChanges,
			dependencies,
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
