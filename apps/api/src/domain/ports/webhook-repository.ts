export type WebhookProvider = "github" | "gitlab" | "bitbucket";

export type ActiveRepository = {
	id: string;
	installationId: string;
	defaultBranch: string;
};

export type InstallationLookup = {
	provider: WebhookProvider;
	providerInstallationId: string;
};

export type UpsertInstallationInput = InstallationLookup & {
	organizationId: string;
	providerAccountId: string;
	accountLogin: string;
	accountType: string;
	status: "active" | "suspended" | "deleted";
	deletedAt: Date | null;
};

export type UpsertRepositoryInput = {
	installationId: string;
	provider: WebhookProvider;
	providerRepositoryId: string;
	ownerLogin: string;
	name: string;
	fullName: string;
	defaultBranch: string;
	status: "active" | "archived" | "removed";
	isActive: boolean;
	lastSyncedAt: Date | null;
};

export interface WebhookRepository {
	findInstallation(
		input: InstallationLookup,
	): Promise<{ id: string; organizationId?: string } | null>;
	upsertInstallation(input: UpsertInstallationInput): Promise<{ id: string }>;
	markInstallationDeleted(input: InstallationLookup): Promise<void>;
	findActiveRepository(input: {
		provider: WebhookProvider;
		providerInstallationId: string;
		providerRepositoryId: string;
	}): Promise<ActiveRepository | null>;
	upsertRepository(input: UpsertRepositoryInput): Promise<void>;
	markRepositoriesRemoved(input: {
		provider: WebhookProvider;
		providerInstallationId: string;
		providerRepositoryIds: readonly string[];
	}): Promise<void>;
}
