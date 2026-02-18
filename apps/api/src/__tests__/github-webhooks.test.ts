import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createLogger } from "../logger.js";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type { WebhookDatabase } from "../routes/github-webhooks.js";

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

const createMockDatabase = (): WebhookDatabase => {
	return {
		organization: {
			upsert: vi.fn(async () => ({ id: "github-org-9876" })),
		},
		providerInstallation: {
			upsert: vi.fn(async () => ({})),
			updateMany: vi.fn(async () => ({ count: 1 })),
		},
		providerRepository: {
			findFirst: vi.fn(async () => ({
				id: "repo-1",
				installationId: "installation-1",
				defaultBranch: "main",
			})),
			updateMany: vi.fn(async () => ({ count: 1 })),
		},
	};
};

const makeApp = (db: WebhookDatabase, enqueueAnalyzeChanges: AnalyzeChangesEnqueuer) => {
	const logger = createLogger("silent", false);

	return createApp({
		logger,
		db,
		enqueueAnalyzeChanges,
		env: {
			NODE_ENV: "test",
			PORT: 3000,
			HOST: "127.0.0.1",
			CORS_ORIGIN: "*",
			LOG_LEVEL: "silent",
			GIT_SHA: "test",
			REDIS_URL: "redis://localhost:6379",
			GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
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
	let db: WebhookDatabase;
	let enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	let enqueueMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		db = createMockDatabase();
		enqueueMock = vi.fn(async () => undefined);
		enqueueAnalyzeChanges = enqueueMock;
	});

	it("rejects requests with missing signature", async () => {
		const app = makeApp(db, enqueueAnalyzeChanges);
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
		const app = makeApp(db, enqueueAnalyzeChanges);
		const response = await dispatchWebhook(
			app,
			"installation",
			readFixture("installation-created.json"),
		);

		expect(response.status).toBe(200);
		expect(db.organization.upsert).toHaveBeenCalledOnce();
		expect(db.providerInstallation.upsert).toHaveBeenCalledOnce();
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("enqueues for push events on active repository default branch", async () => {
		const app = makeApp(db, enqueueAnalyzeChanges);
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"));

		expect(response.status).toBe(200);
		expect(db.providerRepository.findFirst).toHaveBeenCalledOnce();
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
		const app = makeApp(db, enqueueAnalyzeChanges);
		const payload = readFixture("push-main.json");
		payload.ref = "refs/heads/feature-x";

		const response = await dispatchWebhook(app, "push", payload);

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("enqueues for merged pull_request events targeting active repo default branch", async () => {
		const app = makeApp(db, enqueueAnalyzeChanges);
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
		const app = makeApp(db, enqueueAnalyzeChanges);
		const payload = readFixture("installation-created.json");
		payload.action = "deleted";

		const response = await dispatchWebhook(app, "installation", payload);

		expect(response.status).toBe(200);
		expect(db.providerInstallation.updateMany).toHaveBeenCalledOnce();
		expect(db.providerRepository.updateMany).toHaveBeenCalledOnce();
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("returns 400 when X-GitHub-Event header is missing", async () => {
		const app = makeApp(db, enqueueAnalyzeChanges);
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
		const app = makeApp(db, enqueueAnalyzeChanges);
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
		const app = makeApp(db, enqueueAnalyzeChanges);
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
		const app = makeApp(db, enqueueAnalyzeChanges);
		const requestId = "cd3446de-f91f-4033-bbd2-1568366e6837";
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"), {
			requestId,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-request-id")).toBe(requestId);
	});

	it("returns 200 for unhandled event types without enqueueing", async () => {
		const app = makeApp(db, enqueueAnalyzeChanges);
		const response = await dispatchWebhook(app, "issues", { action: "opened" });

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});

	it("does not enqueue when repository is inactive or unknown", async () => {
		db.providerRepository.findFirst = vi.fn(async () => null);
		const app = makeApp(db, enqueueAnalyzeChanges);
		const response = await dispatchWebhook(app, "push", readFixture("push-main.json"));

		expect(response.status).toBe(200);
		expect(enqueueMock).not.toHaveBeenCalled();
	});
});
