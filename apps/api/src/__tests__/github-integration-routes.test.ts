import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createMockDb } from "@synk-ai/test-utils";
import type { AppDependencies } from "../composition/dependencies";
import { AccessDeniedError } from "../domain/errors/access-denied-error";
import { InstallationStateError } from "../domain/errors/installation-state-error";
import type { GitHubIntegrationServiceContract } from "../domain/services/github-integration-service";
import type { DashboardServiceContract } from "../domain/services/index";
import { createLogger } from "../logger";

const mockDb = createMockDb();

mock.module("@synk-ai/db", () => ({ db: mockDb }));

const SESSION_TOKEN = "session-token";
const USER_ID = "user-1";
const ORG_ID = "f9d4ec8f-3a10-4c66-b658-22d615f8de16";
const REDIRECT_URL = "https://github.com/apps/synk-ai/installations/new?state=abc.def";

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

const createNoopDashboardService = (): DashboardServiceContract => ({
	patchRepository: mock(async () => {
		throw new Error("dashboardService.patchRepository should not be called");
	}),
	listInstallationRepositories: mock(async () => {
		throw new Error("dashboardService.listInstallationRepositories should not be called");
	}),
	listRepositoryRuns: mock(async () => {
		throw new Error("dashboardService.listRepositoryRuns should not be called");
	}),
	triggerManualRun: mock(async () => {
		throw new Error("dashboardService.triggerManualRun should not be called");
	}),
	getRunDetail: mock(async () => {
		throw new Error("dashboardService.getRunDetail should not be called");
	}),
	getOrganizationSetupStatus: mock(async () => {
		throw new Error("dashboardService.getOrganizationSetupStatus should not be called");
	}),
	listUserOrganizations: mock(async () => {
		throw new Error("dashboardService.listUserOrganizations should not be called");
	}),
});

const createTestApp = (integrationService: GitHubIntegrationServiceContract) => {
	const logger = createLogger("silent", false);
	const dependencies: AppDependencies = {
		dashboardService: createNoopDashboardService(),
		integrationService,
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
			CORS_ORIGIN: "https://app.example.com",
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

const GITHUB_INTEGRATION_BASE = "/api/v1/integrations/github";

describe("GitHub integration routes", () => {
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

	describe("POST /install/init", () => {
		it("returns 200 and redirect URL when body is valid and user is authenticated", async () => {
			const initiateInstallation = mock(async () => ({ redirectUrl: REDIRECT_URL }));
			const app = createTestApp({
				initiateInstallation,
				completeInstallation: mock(async () => ({ organizationSlug: "acme" })),
			});

			const response = await app.request(`${GITHUB_INTEGRATION_BASE}/install/init`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-type": "application/json",
				},
				body: JSON.stringify({ organizationId: ORG_ID }),
			});

			expect(response.status).toBe(200);
			const body = (await response.json()) as { data: { redirectUrl: string } };
			expect(body.data.redirectUrl).toBe(REDIRECT_URL);
			expect(initiateInstallation).toHaveBeenCalledWith({
				userId: USER_ID,
				organizationId: ORG_ID,
			});
		});

		it("returns 401 when user is not authenticated", async () => {
			getSessionMock.mockResolvedValue(null);
			const initiateInstallation = mock(async () => ({ redirectUrl: REDIRECT_URL }));
			const app = createTestApp({
				initiateInstallation,
				completeInstallation: mock(async () => ({ organizationSlug: "acme" })),
			});

			const response = await app.request(`${GITHUB_INTEGRATION_BASE}/install/init`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-type": "application/json",
				},
				body: JSON.stringify({ organizationId: ORG_ID }),
			});

			expect(response.status).toBe(401);
			expect(initiateInstallation).not.toHaveBeenCalled();
		});

		it("returns 400 when request body is not valid JSON", async () => {
			const initiateInstallation = mock(async () => ({ redirectUrl: REDIRECT_URL }));
			const app = createTestApp({
				initiateInstallation,
				completeInstallation: mock(async () => ({ organizationSlug: "acme" })),
			});

			const response = await app.request(`${GITHUB_INTEGRATION_BASE}/install/init`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-type": "application/json",
				},
				body: "{",
			});

			expect(response.status).toBe(400);
			const body = (await response.json()) as { error: { code: string; message: string } };
			expect(body.error.code).toBe("BAD_REQUEST");
			expect(body.error.message).toMatch(/invalid json|malformed json/i);
			expect(initiateInstallation).not.toHaveBeenCalled();
		});

		it("returns 400 when organizationId is missing", async () => {
			const initiateInstallation = mock(async () => ({ redirectUrl: REDIRECT_URL }));
			const app = createTestApp({
				initiateInstallation,
				completeInstallation: mock(async () => ({ organizationSlug: "acme" })),
			});

			const response = await app.request(`${GITHUB_INTEGRATION_BASE}/install/init`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-type": "application/json",
				},
				body: JSON.stringify({}),
			});

			expect(response.status).toBe(400);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe("BAD_REQUEST");
			expect(initiateInstallation).not.toHaveBeenCalled();
		});

		it("returns 400 when organizationId is not a valid UUID", async () => {
			const initiateInstallation = mock(async () => ({ redirectUrl: REDIRECT_URL }));
			const app = createTestApp({
				initiateInstallation,
				completeInstallation: mock(async () => ({ organizationSlug: "acme" })),
			});

			const response = await app.request(`${GITHUB_INTEGRATION_BASE}/install/init`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-type": "application/json",
				},
				body: JSON.stringify({ organizationId: "not-a-uuid" }),
			});

			expect(response.status).toBe(400);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe("BAD_REQUEST");
			expect(initiateInstallation).not.toHaveBeenCalled();
		});

		it("returns 400 when body contains unknown fields (strict schema)", async () => {
			const initiateInstallation = mock(async () => ({ redirectUrl: REDIRECT_URL }));
			const app = createTestApp({
				initiateInstallation,
				completeInstallation: mock(async () => ({ organizationSlug: "acme" })),
			});

			const response = await app.request(`${GITHUB_INTEGRATION_BASE}/install/init`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-type": "application/json",
				},
				body: JSON.stringify({ organizationId: ORG_ID, extra: "field" }),
			});

			expect(response.status).toBe(400);
			const body = (await response.json()) as { error: { code: string } };
			expect(body.error.code).toBe("BAD_REQUEST");
			expect(initiateInstallation).not.toHaveBeenCalled();
		});

		it("returns 403 when user is not a member of the organization", async () => {
			const initiateInstallation = mock(async () => {
				throw new AccessDeniedError("You are not a member of this organization");
			});
			const app = createTestApp({
				initiateInstallation,
				completeInstallation: mock(async () => ({ organizationSlug: "acme" })),
			});

			const response = await app.request(`${GITHUB_INTEGRATION_BASE}/install/init`, {
				method: "POST",
				headers: {
					...authHeaders(),
					"content-type": "application/json",
				},
				body: JSON.stringify({ organizationId: ORG_ID }),
			});

			expect(response.status).toBe(403);
		});
	});

	describe("GET /install/callback", () => {
		it("returns 200 with organizationSlug when completeInstallation succeeds", async () => {
			const completeInstallation = mock(async () => ({ organizationSlug: "acme" }));
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?installation_id=12345&setup_action=install&state=csrf-state-token`,
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as { data: { organizationSlug: string } };
			expect(body).toEqual({ data: { organizationSlug: "acme" } });
			expect(completeInstallation).toHaveBeenCalledWith({
				token: "csrf-state-token",
				installationId: 12345,
			});
		});

		it("returns 400 BAD_REQUEST when query validation fails (missing installation_id)", async () => {
			const completeInstallation = mock(async () => ({ organizationSlug: "acme" }));
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?setup_action=install&state=token`,
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as { error: { code: string; message: string } };
			expect(body).toEqual({ error: { code: "BAD_REQUEST", message: expect.any(String) } });
			expect(completeInstallation).not.toHaveBeenCalled();
		});

		it("returns 400 BAD_REQUEST when state is missing", async () => {
			const completeInstallation = mock(async () => ({ organizationSlug: "acme" }));
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?installation_id=12345&setup_action=install`,
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as { error: { code: string; message: string } };
			expect(body).toEqual({ error: { code: "BAD_REQUEST", message: expect.any(String) } });
			expect(completeInstallation).not.toHaveBeenCalled();
		});

		it("returns 400 BAD_REQUEST when setup_action is invalid", async () => {
			const completeInstallation = mock(async () => ({ organizationSlug: "acme" }));
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?installation_id=12345&setup_action=invalid&state=token`,
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as { error: { code: string; message: string } };
			expect(body).toEqual({ error: { code: "BAD_REQUEST", message: expect.any(String) } });
			expect(completeInstallation).not.toHaveBeenCalled();
		});

		it("returns 422 UNPROCESSABLE_ENTITY when InstallationStateError is thrown", async () => {
			const completeInstallation = mock(async () => {
				throw new InstallationStateError(
					"Installation state is invalid, expired, or already consumed.",
				);
			});
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?installation_id=12345&setup_action=install&state=bad-token`,
			);

			expect(response.status).toBe(422);
			const body = (await response.json()) as { error: { code: string; message: string } };
			expect(body).toEqual({
				error: { code: "UNPROCESSABLE_ENTITY", message: expect.any(String) },
			});
			expect(completeInstallation).toHaveBeenCalledWith({
				token: "bad-token",
				installationId: 12345,
			});
		});

		it("returns 403 FORBIDDEN when AccessDeniedError is thrown", async () => {
			const completeInstallation = mock(async () => {
				throw new AccessDeniedError("Access denied");
			});
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?installation_id=12345&setup_action=install&state=token`,
			);

			expect(response.status).toBe(403);
			const body = (await response.json()) as { error: { code: string; message: string } };
			expect(body).toEqual({ error: { code: "FORBIDDEN", message: expect.any(String) } });
		});

		it("returns 500 INTERNAL_ERROR when unknown error is thrown", async () => {
			const completeInstallation = mock(async () => {
				throw new Error("Unexpected failure");
			});
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?installation_id=12345&setup_action=install&state=token`,
			);

			expect(response.status).toBe(500);
			const body = (await response.json()) as { error: { code: string; message: string } };
			expect(body).toEqual({ error: { code: "INTERNAL_ERROR", message: expect.any(String) } });
		});

		it("accepts setup_action=update as valid", async () => {
			const completeInstallation = mock(async () => ({ organizationSlug: "updated-org" }));
			const app = createTestApp({
				initiateInstallation: mock(async () => ({ redirectUrl: REDIRECT_URL })),
				completeInstallation,
			});

			const response = await app.request(
				`${GITHUB_INTEGRATION_BASE}/install/callback?installation_id=99999&setup_action=update&state=update-state`,
			);

			expect(response.status).toBe(200);
			const body = (await response.json()) as { data: { organizationSlug: string } };
			expect(body).toEqual({ data: { organizationSlug: "updated-org" } });
			expect(completeInstallation).toHaveBeenCalledWith({
				token: "update-state",
				installationId: 99999,
			});
		});
	});
});
