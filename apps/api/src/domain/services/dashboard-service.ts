import type { RunStatus } from "@synk-ai/shared";
import type { AnalyzeChangesEnqueuer } from "../../queues/analyze-changes.js";
import type {
	PaginatedResult,
	RepositoryDetail,
	RepositoryListItem,
	RunDetail,
	RunListItem,
} from "../models/dashboard.js";
import type { AuthorizationRepository } from "../ports/authorization-repository.js";
import type { DashboardRepository } from "../ports/dashboard-repository.js";
import type { RunRepository } from "../ports/run-repository.js";

export type DashboardServiceDependencies = {
	authorizationRepository: AuthorizationRepository;
	dashboardRepository: DashboardRepository;
	runRepository: RunRepository;
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
	page: number;
	pageSize: number;
};

export type ListRepositoryRunsInput = {
	repositoryId: string;
	userId: string;
	page: number;
	pageSize: number;
	status?: readonly RunStatus[];
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
