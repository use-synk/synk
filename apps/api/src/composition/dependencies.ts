import { db } from "@synk-ai/db";
import {
	createAppOctokit,
	createInstallationOctokit,
	credentialsFromEnvironment,
} from "@synk-ai/github";
import type {
	DashboardServiceContract,
	GitHubInstallationDetails,
	GitHubIntegrationServiceContract,
} from "../domain/services/index";
import type { ApiEnvironment } from "../env";
import { createPrismaDashboardRepositories } from "../infrastructure/prisma/dashboard.repositories";
import { createPrismaDashboardUnitOfWork } from "../infrastructure/prisma/dashboard.unit-of-work";
import { createPrismaInstallationOAuthStateRepository } from "../infrastructure/prisma/installation-oauth-state.repository";
import { createPrismaWebhookRepositories } from "../infrastructure/prisma/webhook.repositories";
import { DashboardService } from "../modules/dashboard/dashboard.service";
import { GitHubIntegrationService } from "../modules/integrations/github";
import type { ListInstallationRepositories } from "../modules/webhooks/github/types";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes";

export type AppDependencies = {
	dashboardService: DashboardServiceContract;
	integrationService: GitHubIntegrationServiceContract;
	listInstallationRepositories: ListInstallationRepositories;
};

export type BuildAppDependenciesOptions = {
	env: ApiEnvironment;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	/** Override for testing. In production this is derived from GitHub credentials. */
	listInstallationRepositories?: ListInstallationRepositories;
};

export const buildAppDependencies = (options: BuildAppDependenciesOptions): AppDependencies => {
	const { env } = options;

	const dashboardRepositories = createPrismaDashboardRepositories();
	const unitOfWork = createPrismaDashboardUnitOfWork();
	const { webhookRepository } = createPrismaWebhookRepositories();
	const installationOAuthStateRepository = createPrismaInstallationOAuthStateRepository();

	const githubCredentials = credentialsFromEnvironment(env);
	const appOctokit = createAppOctokit(githubCredentials);

	const listInstallationRepositories: ListInstallationRepositories =
		options.listInstallationRepositories ??
		(async (installationId) => {
			const installationOctokit = createInstallationOctokit(installationId, githubCredentials);
			return installationOctokit.paginate(
				installationOctokit.rest.apps.listReposAccessibleToInstallation,
				{ per_page: 100 },
			);
		});

	const getInstallationDetails = async (
		installationId: number,
	): Promise<GitHubInstallationDetails> => {
		const { data } = await appOctokit.rest.apps.getInstallation({
			installation_id: installationId,
		});

		// `account` is a union of User, Organization, Enterprise shapes, or null.
		// We extract fields defensively to avoid relying on the exact union type.
		const account: unknown = data.account;

		const accountId =
			account != null &&
			typeof account === "object" &&
			"id" in account &&
			typeof (account as Record<string, unknown>).id === "number"
				? String((account as Record<string, unknown>).id)
				: String(installationId);

		const accountLogin =
			account != null &&
			typeof account === "object" &&
			"login" in account &&
			typeof (account as Record<string, unknown>).login === "string"
				? String((account as Record<string, unknown>).login)
				: `github-${installationId}`;

		const accountType =
			account != null &&
			typeof account === "object" &&
			"type" in account &&
			typeof (account as Record<string, unknown>).type === "string"
				? String((account as Record<string, unknown>).type)
				: "User";

		return {
			providerInstallationId: String(data.id),
			providerAccountId: accountId,
			accountLogin,
			accountType,
		};
	};

	return {
		dashboardService: new DashboardService({
			...dashboardRepositories,
			unitOfWork,
			enqueueAnalyzeChanges: options.enqueueAnalyzeChanges,
		}),
		integrationService: new GitHubIntegrationService({
			authorizationRepository: dashboardRepositories.authorizationRepository,
			installationOAuthStateRepository,
			webhookRepository,
			listInstallationRepositories,
			getInstallationDetails,
			findOrganizationSlug: (id) =>
				db.organization
					.findUniqueOrThrow({
						where: { id },
						select: { slug: true },
					})
					.then((organization) => organization.slug),
			githubAppSlug: env.GITHUB_APP_SLUG,
		}),
		listInstallationRepositories,
	};
};
