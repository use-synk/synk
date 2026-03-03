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

export type ProjectAccessQuery = {
	projectId: string;
	userId: string;
};

export type OrganizationMembershipQuery = {
	userId: string;
	organizationId: string;
};

export interface AuthorizationRepository {
	hasInstallationAccess(query: InstallationAccessQuery): Promise<boolean>;
	hasRepositoryAccess(query: RepositoryAccessQuery): Promise<boolean>;
	hasRunAccess(query: RunAccessQuery): Promise<boolean>;
	hasProjectAccess(query: ProjectAccessQuery): Promise<boolean>;
	assertInstallationAccess(query: InstallationAccessQuery): Promise<void>;
	assertRepositoryAccess(query: RepositoryAccessQuery): Promise<void>;
	assertRunAccess(query: RunAccessQuery): Promise<void>;
	assertProjectAccess(query: ProjectAccessQuery): Promise<void>;
	assertOrganizationMembership(query: OrganizationMembershipQuery): Promise<void>;
}
