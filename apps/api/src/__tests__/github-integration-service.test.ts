import { describe, expect, it, mock } from "bun:test";
import type { GitHubIntegrationServiceDependencies } from "../domain/services/github-integration-service";
import { GitHubIntegrationService } from "../modules/integrations/github";

const STATE_TOKEN_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

const createDependencies = (): {
	deps: GitHubIntegrationServiceDependencies;
	mocks: {
		assertOrganizationMembership: ReturnType<typeof mock>;
		createState: ReturnType<typeof mock>;
	};
} => {
	const assertOrganizationMembership = mock(async () => undefined);
	const createState = mock(async () => undefined);

	return {
		deps: {
			authorizationRepository: {
				hasInstallationAccess: mock(async () => true),
				hasRepositoryAccess: mock(async () => true),
				hasRunAccess: mock(async () => true),
				assertInstallationAccess: mock(async () => undefined),
				assertRepositoryAccess: mock(async () => undefined),
				assertRunAccess: mock(async () => undefined),
				assertOrganizationMembership,
			},
			installationOAuthStateRepository: {
				createState,
				claimState: mock(async () => null),
			},
			webhookRepository: {
				findInstallation: mock(async () => null),
				upsertInstallation: mock(async () => ({ id: "installation-1" })),
				markInstallationDeleted: mock(async () => undefined),
				findActiveRepository: mock(async () => null),
				upsertRepository: mock(async () => undefined),
				markRepositoriesRemoved: mock(async () => undefined),
			},
			listInstallationRepositories: mock(async () => []),
			getInstallationDetails: mock(async () => ({
				providerInstallationId: "123",
				providerAccountId: "456",
				accountLogin: "acme",
				accountType: "Organization",
			})),
			githubAppSlug: "synk-ai",
		},
		mocks: {
			assertOrganizationMembership,
			createState,
		},
	};
};

describe("GitHubIntegrationService", () => {
	it("creates a 256-bit UUID-formatted state token for installation init", async () => {
		const { deps, mocks } = createDependencies();
		const service = new GitHubIntegrationService(deps);
		const before = Date.now();

		const result = await service.initiateInstallation({
			userId: "user-1",
			organizationId: "f9d4ec8f-3a10-4c66-b658-22d615f8de16",
		});

		expect(mocks.assertOrganizationMembership).toHaveBeenCalledWith({
			userId: "user-1",
			organizationId: "f9d4ec8f-3a10-4c66-b658-22d615f8de16",
		});
		expect(mocks.createState).toHaveBeenCalledOnce();

		const createStateInput = mocks.createState.mock.calls[0]?.[0];
		expect(createStateInput).toBeDefined();
		expect(createStateInput.token).toMatch(STATE_TOKEN_PATTERN);
		expect(createStateInput.userId).toBe("user-1");
		expect(createStateInput.organizationId).toBe("f9d4ec8f-3a10-4c66-b658-22d615f8de16");

		const expiresDeltaMs = createStateInput.expiresAt.getTime() - before;
		expect(expiresDeltaMs).toBeGreaterThanOrEqual(FIFTEEN_MINUTES_MS - 1_000);
		expect(expiresDeltaMs).toBeLessThanOrEqual(FIFTEEN_MINUTES_MS + 1_000);

		const redirectUrl = new URL(result.redirectUrl);
		expect(redirectUrl.toString()).toContain("https://github.com/apps/synk-ai/installations/new");
		expect(redirectUrl.searchParams.get("state")).toBe(createStateInput.token);
	});
});
