export type InstallationAccessQuery = {
	installationId: string;
	userId: string;
};

export type RepositoryAccessQuery = {
	repositoryId: string;
	userId: string;
};

export type RunAccessQuery = {
	runId: string;
	userId: string;
};

export interface AuthorizationRepository {
	hasInstallationAccess(query: InstallationAccessQuery): Promise<boolean>;
	hasRepositoryAccess(query: RepositoryAccessQuery): Promise<boolean>;
	hasRunAccess(query: RunAccessQuery): Promise<boolean>;
	assertInstallationAccess(query: InstallationAccessQuery): Promise<void>;
	assertRepositoryAccess(query: RepositoryAccessQuery): Promise<void>;
	assertRunAccess(query: RunAccessQuery): Promise<void>;
}
