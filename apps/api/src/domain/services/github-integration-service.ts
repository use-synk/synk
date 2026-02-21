import type { AuthorizationRepository } from "../ports/authorization-repository";
import type { InstallationOAuthStateRepository } from "../ports/installation-oauth-state-repository";
import type { WebhookRepository } from "../ports/webhook-repository";
import type { ListInstallationRepositories } from "../../modules/webhooks/github/types";

export type GitHubInstallationDetails = {
	providerInstallationId: string;
	providerAccountId: string;
	accountLogin: string;
	accountType: string;
};

export type GitHubIntegrationServiceDependencies = {
	authorizationRepository: AuthorizationRepository;
	installationOAuthStateRepository: InstallationOAuthStateRepository;
	webhookRepository: WebhookRepository;
	listInstallationRepositories: ListInstallationRepositories;
	getInstallationDetails: (installationId: number) => Promise<GitHubInstallationDetails>;
	githubAppSlug: string;
};

export type InitiateInstallationInput = {
	userId: string;
	organizationId: string;
};

export type InitiateInstallationResult = {
	redirectUrl: string;
};

export type CompleteInstallationInput = {
	token: string;
	installationId: number;
};

export interface GitHubIntegrationServiceContract {
	initiateInstallation(input: InitiateInstallationInput): Promise<InitiateInstallationResult>;
	completeInstallation(input: CompleteInstallationInput): Promise<void>;
}
