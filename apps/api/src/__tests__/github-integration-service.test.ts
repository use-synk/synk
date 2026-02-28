import { describe, expect, it, mock } from "bun:test";
import { AccessDeniedError } from "../domain/errors/access-denied-error";
import { InstallationStateError } from "../domain/errors/installation-state-error";
import type { GitHubIntegrationServiceDependencies } from "../domain/services/github-integration-service";
import { GitHubIntegrationService } from "../modules/integrations/github";

const STATE_TOKEN_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ORG_ID = "f9d4ec8f-3a10-4c66-b658-22d615f8de16";
const USER_ID = "user-1";

const createDependencies = (): {
	deps: GitHubIntegrationServiceDependencies;
	mocks: {
		assertOrganizationMembership: ReturnType<typeof mock>;
		createState: ReturnType<typeof mock>;
		claimState: ReturnType<typeof mock>;
		getInstallationDetails: ReturnType<typeof mock>;
		findOrganizationSlug: ReturnType<typeof mock>;
		upsertInstallation: ReturnType<typeof mock>;
		listInstallationRepositories: ReturnType<typeof mock>;
	};
} => {
	const assertOrganizationMembership = mock(async () => undefined);
	const createState = mock(async () => undefined);
	const claimState = mock(async () => null);
	const getInstallationDetails = mock(async () => ({
		providerInstallationId: "123",
		providerAccountId: "456",
		accountLogin: "acme",
		accountType: "Organization",
	}));
	const findOrganizationSlug = mock(async () => "acme");
	const upsertInstallation = mock(async () => ({ id: "installation-1" }));
	const listInstallationRepositories = mock(async () => []);

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
				claimState,
			},
			webhookRepository: {
				findInstallation: mock(async () => null),
				upsertInstallation,
				markInstallationDeleted: mock(async () => undefined),
				findActiveRepository: mock(async () => null),
				upsertRepository: mock(async () => undefined),
				markRepositoriesRemoved: mock(async () => undefined),
			},
			listInstallationRepositories,
			getInstallationDetails,
			organizationRepository: {
				findOrganizationSlug,
			},
			githubAppSlug: "synk-ai",
		},
		mocks: {
			assertOrganizationMembership,
			createState,
			claimState,
			getInstallationDetails,
			findOrganizationSlug,
			upsertInstallation,
			listInstallationRepositories,
		},
	};
};

describe("GitHubIntegrationService", () => {
	describe("initiateInstallation", () => {
		it("creates a 256-bit UUID-formatted state token and returns redirect URL", async () => {
			const { deps, mocks } = createDependencies();
			const service = new GitHubIntegrationService(deps);
			const before = Date.now();

			const result = await service.initiateInstallation({
				userId: USER_ID,
				organizationId: ORG_ID,
			});

			expect(mocks.assertOrganizationMembership).toHaveBeenCalledWith({
				userId: USER_ID,
				organizationId: ORG_ID,
			});
			expect(mocks.createState).toHaveBeenCalledOnce();

			const createStateInput = mocks.createState.mock.calls[0]?.[0];
			expect(createStateInput).toBeDefined();
			expect(createStateInput.token).toMatch(STATE_TOKEN_PATTERN);
			expect(createStateInput.userId).toBe(USER_ID);
			expect(createStateInput.organizationId).toBe(ORG_ID);

			const expiresDeltaMs = createStateInput.expiresAt.getTime() - before;
			expect(expiresDeltaMs).toBeGreaterThanOrEqual(FIFTEEN_MINUTES_MS - 1_000);
			expect(expiresDeltaMs).toBeLessThanOrEqual(FIFTEEN_MINUTES_MS + 1_000);

			const redirectUrl = new URL(result.redirectUrl);
			expect(redirectUrl.toString()).toContain("https://github.com/apps/synk-ai/installations/new");
			expect(redirectUrl.searchParams.get("state")).toBe(createStateInput.token);
		});

		it("uses githubAppSlug from dependencies in redirect URL", async () => {
			const { deps, mocks } = createDependencies();
			deps.githubAppSlug = "my-custom-app";
			const service = new GitHubIntegrationService(deps);

			const result = await service.initiateInstallation({
				userId: USER_ID,
				organizationId: ORG_ID,
			});

			expect(result.redirectUrl).toContain(
				"https://github.com/apps/my-custom-app/installations/new",
			);
			expect(mocks.createState).toHaveBeenCalledOnce();
		});

		it("throws when user is not a member of the organization", async () => {
			const { deps, mocks } = createDependencies();
			mocks.assertOrganizationMembership.mockRejectedValueOnce(
				new AccessDeniedError("You are not a member of this organization"),
			);
			const service = new GitHubIntegrationService(deps);

			await expect(
				service.initiateInstallation({ userId: USER_ID, organizationId: ORG_ID }),
			).rejects.toThrow(AccessDeniedError);

			expect(mocks.createState).not.toHaveBeenCalled();
		});
	});

	describe("completeInstallation", () => {
		it("throws InstallationStateError when state token is invalid or already consumed", async () => {
			const { deps, mocks } = createDependencies();
			mocks.claimState.mockResolvedValueOnce(null);
			const service = new GitHubIntegrationService(deps);

			await expect(
				service.completeInstallation({
					token: "any-token",
					installationId: 12345,
				}),
			).rejects.toThrow(InstallationStateError);

			expect(mocks.claimState).toHaveBeenCalledWith("any-token");
			expect(mocks.getInstallationDetails).not.toHaveBeenCalled();
			expect(mocks.upsertInstallation).not.toHaveBeenCalled();
		});

		it("claims state, fetches installation details, upserts installation, syncs repositories, and returns organization slug", async () => {
			const { deps, mocks } = createDependencies();
			const claimedState = {
				id: "state-1",
				token: "abc.uuid.def.uuid",
				userId: USER_ID,
				organizationId: ORG_ID,
				status: "pending" as const,
				expiresAt: new Date(Date.now() + 60_000),
				consumedAt: null as Date | null,
				createdAt: new Date(),
			};
			mocks.claimState.mockResolvedValueOnce(claimedState);
			mocks.getInstallationDetails.mockResolvedValueOnce({
				providerInstallationId: "999",
				providerAccountId: "888",
				accountLogin: "my-org",
				accountType: "Organization",
			});
			mocks.findOrganizationSlug.mockResolvedValueOnce("my-org");
			mocks.upsertInstallation.mockResolvedValueOnce({ id: "internal-installation-id" });

			const service = new GitHubIntegrationService(deps);

			const result = await service.completeInstallation({
				token: "abc.uuid.def.uuid",
				installationId: 12345,
			});

			expect(mocks.claimState).toHaveBeenCalledWith("abc.uuid.def.uuid");
			expect(mocks.findOrganizationSlug).toHaveBeenCalledWith(ORG_ID);
			expect(mocks.getInstallationDetails).toHaveBeenCalledWith(12345);
			expect(mocks.upsertInstallation).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				provider: "github",
				providerInstallationId: "999",
				providerAccountId: "888",
				accountLogin: "my-org",
				accountType: "Organization",
				status: "active",
				deletedAt: null,
			});
			expect(mocks.listInstallationRepositories).toHaveBeenCalledWith(12345);
			expect(result).toEqual({ organizationSlug: "my-org" });
		});

		it("calls sync with internal installation id and numeric GitHub installation id", async () => {
			const { deps, mocks } = createDependencies();
			mocks.claimState.mockResolvedValueOnce({
				id: "state-1",
				token: "token",
				userId: USER_ID,
				organizationId: ORG_ID,
				status: "pending",
				expiresAt: new Date(Date.now() + 60_000),
				consumedAt: null,
				createdAt: new Date(),
			});
			mocks.findOrganizationSlug.mockResolvedValueOnce("acme");
			mocks.upsertInstallation.mockResolvedValueOnce({ id: "our-db-installation-uuid" });

			const service = new GitHubIntegrationService(deps);

			const result = await service.completeInstallation({
				token: "token",
				installationId: 67890,
			});

			expect(mocks.upsertInstallation).toHaveBeenCalledOnce();
			expect(mocks.listInstallationRepositories).toHaveBeenCalledWith(67890);
			expect(result).toEqual({ organizationSlug: "acme" });
			// syncInstallationRepositories uses upserted.id (our-db-installation-uuid) internally
			// and listInstallationRepositories(67890); we can't assert upserted.id here without
			// inspecting the helper, but we verified upsert returns that id and list is called with numeric id.
		});
	});
});

describe("InstallationStateError", () => {
	it("has name InstallationStateError and preserves message", () => {
		const err = new InstallationStateError("Custom message");
		expect(err.name).toBe("InstallationStateError");
		expect(err.message).toBe("Custom message");
		expect(err).toBeInstanceOf(Error);
	});
});
