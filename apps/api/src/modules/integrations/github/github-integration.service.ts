import { randomBytes } from "node:crypto";
import { InstallationStateError } from "../../../domain/errors/installation-state-error";
import type {
	CompleteInstallationInput,
	CompleteInstallationResult,
	GitHubIntegrationServiceContract,
	GitHubIntegrationServiceDependencies,
	InitiateInstallationInput,
	InitiateInstallationResult,
} from "../../../domain/services/github-integration-service";
import { syncInstallationRepositories } from "../../webhooks/github/repository-helpers";

const PROVIDER_GITHUB = "github" as const;
const INSTALLATION_STATE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const toUuidFromRandomBytes = (bytes: Uint8Array): string => {
	const hex = Buffer.from(bytes).toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const createInstallationStateToken = (): string => {
	const random = randomBytes(32);
	const partA = toUuidFromRandomBytes(random.subarray(0, 16));
	const partB = toUuidFromRandomBytes(random.subarray(16, 32));
	return `${partA}.${partB}`;
};

export class GitHubIntegrationService implements GitHubIntegrationServiceContract {
	constructor(private readonly deps: GitHubIntegrationServiceDependencies) {}

	/**
	 * Initiates the GitHub App installation OAuth flow.
	 *
	 * Validates that the requesting user is a member of the target organization,
	 * then generates a cryptographically random CSRF state token and persists it
	 * with a 15-minute TTL. Returns the GitHub App installation URL with the
	 * state token appended.
	 *
	 * @throws {AccessDeniedError} if the user is not a member of the organization.
	 */
	async initiateInstallation(
		input: InitiateInstallationInput,
	): Promise<InitiateInstallationResult> {
		const { userId, organizationId } = input;

		await this.deps.authorizationRepository.assertOrganizationMembership({
			userId,
			organizationId,
		});

		const token = createInstallationStateToken();
		const expiresAt = new Date(Date.now() + INSTALLATION_STATE_TTL_MS);

		await this.deps.installationOAuthStateRepository.createState({
			token,
			userId,
			organizationId,
			expiresAt,
		});

		const redirectUrl = `https://github.com/apps/${this.deps.githubAppSlug}/installations/new?state=${token}`;

		return { redirectUrl };
	}

	/**
	 * Completes the GitHub App installation OAuth flow after the user is
	 * redirected back from GitHub.
	 *
	 * Atomically claims the state token to prevent replay attacks, fetches the
	 * installation details from the GitHub API, upserts the ProviderInstallation
	 * record linked to the organization from the state, and syncs all accessible
	 * repositories.
	 *
	 * @throws {InstallationStateError} if the state token is invalid, expired,
	 *   or has already been consumed.
	 */
	async completeInstallation(
		input: CompleteInstallationInput,
	): Promise<CompleteInstallationResult> {
		const { token, installationId } = input;

		const state = await this.deps.installationOAuthStateRepository.claimState(token);
		if (state === null) {
			throw new InstallationStateError(
				"Installation state is invalid, expired, or already consumed.",
			);
		}

		const organizationSlug = await this.deps.findOrganizationSlug(state.organizationId);
		const details = await this.deps.getInstallationDetails(installationId);

		const upserted = await this.deps.webhookRepository.upsertInstallation({
			organizationId: state.organizationId,
			provider: PROVIDER_GITHUB,
			providerInstallationId: details.providerInstallationId,
			providerAccountId: details.providerAccountId,
			accountLogin: details.accountLogin,
			accountType: details.accountType,
			status: "active",
			deletedAt: null,
		});

		await syncInstallationRepositories(
			this.deps.webhookRepository,
			this.deps.listInstallationRepositories,
			upserted.id,
			installationId,
		);

		return { organizationSlug };
	}
}
