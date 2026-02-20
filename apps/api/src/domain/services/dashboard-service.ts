import type { AnalyzeChangesEnqueuer } from "../../queues/analyze-changes";
import type {
	PaginatedResult,
	Pagination,
	RepositoryDetail,
	RepositoryListItem,
	RunDetail,
	RunListFilter,
	RunListItem,
} from "../models/dashboard";
import type { AuthorizationRepository } from "../ports/authorization-repository";
import type { DashboardRepository } from "../ports/dashboard-repository";
import type { DashboardUnitOfWork } from "../ports/dashboard-unit-of-work";
import type { RunRepository } from "../ports/run-repository";

export type DashboardServiceDependencies = {
	authorizationRepository: AuthorizationRepository;
	dashboardRepository: DashboardRepository;
	runRepository: RunRepository;
	unitOfWork: DashboardUnitOfWork;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
};

export type PatchRepositoryInput = {
	repositoryId: string;
	userId: string;
	isActive?: boolean;
};

export type ListInstallationRepositoriesInput = {
	installationId: string;
	userId: string;
	pagination: Pagination;
};

export type ListRepositoryRunsInput = {
	repositoryId: string;
	userId: string;
	filter: RunListFilter;
};

export type TriggerManualRunInput = {
	repositoryId: string;
	userId: string;
	commitSha: string;
	ref?: string;
};

export type TriggerManualRunResult = {
	repositoryId: string;
	triggerType: "manual";
	triggerRef: string;
	triggerCommitSha: string;
	accepted: true;
};

export interface DashboardServiceContract {
	patchRepository(input: PatchRepositoryInput): Promise<RepositoryDetail>;
	listInstallationRepositories(
		input: ListInstallationRepositoriesInput,
	): Promise<PaginatedResult<RepositoryListItem>>;
	listRepositoryRuns(input: ListRepositoryRunsInput): Promise<PaginatedResult<RunListItem>>;
	triggerManualRun(input: TriggerManualRunInput): Promise<TriggerManualRunResult>;
	getRunDetail(runId: string, userId: string): Promise<RunDetail>;
}
