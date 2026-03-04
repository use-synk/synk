import type {
	CreateSuggestionsPrResult,
	PaginatedResult,
	Pagination,
	RepositoryListItem,
	RunListFilter,
	RunListItem,
	SuggestionDecision,
	SuggestionDetail,
	SuggestionListFilter,
	SuggestionSummary,
} from "../models";
import type { Project, ProjectDetail } from "../models/project";
import type { AuthorizationRepository, OrganizationRepository, ProjectRepository } from "../ports";
import type { DashboardRepository } from "../ports/dashboard-repository";
import type { ProjectPatch } from "../ports/project-repository";
import type { GitHubAppCredentials } from "@synk-ai/github";

export type ProjectServiceDependencies = {
	authorizationRepository: AuthorizationRepository;
	organizationRepository: OrganizationRepository;
	projectRepository: ProjectRepository;
	dashboardRepository: DashboardRepository;
	githubCredentials: GitHubAppCredentials;
};

export type CreateProjectInput = {
	userId: string;
	slugOrId: string;
	name: string;
	sourceRepositoryId: string;
	docsRepositoryId: string;
};

export type ListProjectsInput = {
	userId: string;
	slugOrId: string;
	pagination: Pagination;
};

export type UpdateProjectInput = {
	userId: string;
	organizationId: string;
	projectId: string;
	patch: ProjectPatch;
};

export type DeleteProjectInput = {
	userId: string;
	organizationId: string;
	projectId: string;
};

export type FindProjectInput = {
	userId: string;
	organizationId: string;
	projectId: string;
};

export type GetProjectDetailInput = {
	userId: string;
	projectId: string;
};

export type ListProjectRunsInput = {
	userId: string;
	projectId: string;
	filter: RunListFilter;
};

export type ListOrganizationRepositoriesInput = {
	userId: string;
	slugOrId: string;
	pagination: Pagination;
};

export type ListProjectSuggestionsInput = {
	userId: string;
	projectId: string;
	filter: SuggestionListFilter;
};

export type GetProjectSuggestionInput = {
	userId: string;
	projectId: string;
	suggestionId: string;
};

export type DecideProjectSuggestionInput = {
	userId: string;
	projectId: string;
	suggestionId: string;
	decision: SuggestionDecision;
	note?: string;
};

export type BulkDecideProjectSuggestionsInput = {
	userId: string;
	projectId: string;
	suggestionIds: string[];
	decision: SuggestionDecision;
	note?: string;
};

export type CreateProjectSuggestionsPrInput = {
	userId: string;
	projectId: string;
};

export interface ProjectServiceContract {
	findProject(input: FindProjectInput): Promise<Project | null>;
	getProjectDetail(input: GetProjectDetailInput): Promise<ProjectDetail>;
	listProjects(input: ListProjectsInput): Promise<PaginatedResult<Project>>;
	listOrganizationRepositories(
		input: ListOrganizationRepositoriesInput,
	): Promise<PaginatedResult<RepositoryListItem>>;
	listProjectRuns(input: ListProjectRunsInput): Promise<PaginatedResult<RunListItem>>;
	listProjectSuggestions(input: ListProjectSuggestionsInput): Promise<PaginatedResult<SuggestionSummary>>;
	getProjectSuggestion(input: GetProjectSuggestionInput): Promise<SuggestionDetail>;
	decideProjectSuggestion(input: DecideProjectSuggestionInput): Promise<SuggestionDetail>;
	bulkDecideProjectSuggestions(
		input: BulkDecideProjectSuggestionsInput,
	): Promise<SuggestionDetail[]>;
	createProjectSuggestionsPr(input: CreateProjectSuggestionsPrInput): Promise<CreateSuggestionsPrResult>;
	createProject(input: CreateProjectInput): Promise<Project>;
	updateProject(input: UpdateProjectInput): Promise<Project>;
	deleteProject(input: DeleteProjectInput): Promise<void>;
}
