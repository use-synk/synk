export type GitHubInstallationRepository = {
	id: number;
	name: string;
	full_name: string;
	default_branch: string;
	owner: {
		login: string;
	};
};

export type ListInstallationRepositories = (
	installationId: number,
) => Promise<readonly GitHubInstallationRepository[]>;

export type ActiveRepository = {
	id: string;
	installationId: string;
	defaultBranch: string;
};

export type WebhookDatabase = {
	providerInstallation: {
		findUnique(args: {
			where: {
				provider_providerInstallationId: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
				};
			};
			select: { id: true; organizationId?: true };
		}): Promise<{ id: string; organizationId?: string } | null>;
		upsert(args: {
			where: {
				provider_providerInstallationId: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
				};
			};
			create: {
				organizationId: string;
				provider: "github" | "gitlab" | "bitbucket";
				providerInstallationId: string;
				providerAccountId: string;
				accountLogin: string;
				accountType: string;
				status: "active" | "suspended" | "deleted";
				deletedAt: Date | null;
			};
			update: {
				providerAccountId: string;
				accountLogin: string;
				accountType: string;
				status: "active" | "suspended" | "deleted";
				deletedAt: Date | null;
			};
		}): Promise<{ id: string }>;
		updateMany(args: {
			where: {
				provider: "github" | "gitlab" | "bitbucket";
				providerInstallationId: string;
			};
			data: {
				status: "active" | "suspended" | "deleted";
				deletedAt: Date;
			};
		}): Promise<{ count: number }>;
	};
	providerRepository: {
		upsert(args: {
			where: {
				provider_providerRepositoryId: {
					provider: "github" | "gitlab" | "bitbucket";
					providerRepositoryId: string;
				};
			};
			create: {
				installationId: string;
				provider: "github" | "gitlab" | "bitbucket";
				providerRepositoryId: string;
				ownerLogin: string;
				name: string;
				fullName: string;
				defaultBranch: string;
				status: "active" | "archived" | "removed";
				isActive: boolean;
				lastSyncedAt: Date | null;
			};
			update: {
				installationId: string;
				ownerLogin: string;
				name: string;
				fullName: string;
				defaultBranch: string;
				status: "active" | "archived" | "removed";
				isActive: boolean;
				lastSyncedAt: Date | null;
			};
		}): Promise<unknown>;
		findFirst(args: {
			where: {
				provider: "github" | "gitlab" | "bitbucket";
				providerRepositoryId: string;
				isActive: boolean;
				status: "active" | "archived" | "removed";
				installation: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
					status: "active" | "suspended" | "deleted";
				};
			};
			select: { id: true; installationId: true; defaultBranch: true };
		}): Promise<ActiveRepository | null>;
		updateMany(args: {
			where: {
				installation: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
				};
				providerRepositoryId?: { in: string[] };
			};
			data: {
				status: "active" | "archived" | "removed";
				isActive: boolean;
			};
		}): Promise<{ count: number }>;
	};
};
