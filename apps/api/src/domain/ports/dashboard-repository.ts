import type {
	ManualRunRepositoryState,
	PaginatedResult,
	RepositoryDetail,
	RepositoryListItem,
	RepositoryPatch,
	RunListFilter,
	RunListItem,
} from "../models/dashboard.js";

export type UpdateRepositoryCommand = {
	repositoryId: string;
	patch: RepositoryPatch;
};

export type ListInstallationRepositoriesQuery = {
	installationId: string;
	pagination: {
		page: number;
		pageSize: number;
	};
};

export type ListRepositoryRunsQuery = {
	repositoryId: string;
	filter: RunListFilter;
};

export interface DashboardRepository {
	updateRepository(command: UpdateRepositoryCommand): Promise<RepositoryDetail>;
	listInstallationRepositories(
		query: ListInstallationRepositoriesQuery,
	): Promise<PaginatedResult<RepositoryListItem>>;
	listRepositoryRuns(query: ListRepositoryRunsQuery): Promise<PaginatedResult<RunListItem>>;
	findRepositoryForManualRun(repositoryId: string): Promise<ManualRunRepositoryState | null>;
}
