import type { PaginatedResult, RepositoryListItem } from "../models";
import type { Project, ProjectDetail } from "../models/project";
import type {
	CreateSuggestionsPrExcludedItem,
	ProjectSuggestionTarget,
	SuggestionCreatePrCandidate,
	SuggestionDetail,
	SuggestionListFilter,
	SuggestionStats,
	SuggestionSummary,
} from "../models/suggestion";

export type CreateProjectInput = {
	name: string;
	organizationId: string;
	sourceRepositoryId: string;
	docsRepositoryId: string;
};

export type ListProjectsQuery = {
	organizationId: string;
	pagination: {
		page: number;
		pageSize: number;
	};
};

export type ListOrganizationRepositoriesQuery = {
	organizationId: string;
	pagination: {
		page: number;
		pageSize: number;
	};
};

export type ProjectPatch = Partial<
	Pick<Project, "name" | "config" | "docsRepositoryId" | "sourceRepositoryId">
>;

export type UpdateProjectCommand = {
	projectId: string;
	patch: ProjectPatch;
};

export type SuggestionDecisionPatch = {
	status: "pending" | "accepted" | "declined";
	decidedByUserId: string | null;
	decidedAt: Date | null;
	decisionNote: string | null;
};

export interface ProjectRepository {
	findProject(projectId: string): Promise<Project | null>;
	findProjectWithRepositories(projectId: string): Promise<ProjectDetail | null>;
	listProjects(query: ListProjectsQuery): Promise<PaginatedResult<Project>>;
	listOrganizationRepositories(
		query: ListOrganizationRepositoriesQuery,
	): Promise<PaginatedResult<RepositoryListItem>>;
	createProject(project: CreateProjectInput): Promise<Project>;
	updateProject(command: UpdateProjectCommand): Promise<Project>;
	deleteProject(projectId: string): Promise<Project>;
	listProjectSuggestions(
		projectId: string,
		filter: SuggestionListFilter,
	): Promise<PaginatedResult<SuggestionSummary>>;
	countProjectSuggestionStats(projectId: string): Promise<SuggestionStats>;
	findProjectSuggestion(projectId: string, suggestionId: string): Promise<SuggestionDetail | null>;
	findProjectSuggestionsByIds(
		projectId: string,
		suggestionIds: readonly string[],
	): Promise<SuggestionDetail[]>;
	updateSuggestionDecision(
		suggestionId: string,
		patch: SuggestionDecisionPatch,
	): Promise<SuggestionDetail>;
	updateSuggestionsDecision(
		suggestionIds: readonly string[],
		patch: SuggestionDecisionPatch,
	): Promise<void>;
	findProjectSuggestionTarget(projectId: string): Promise<ProjectSuggestionTarget | null>;
	listAcceptedSuggestionsForPr(
		projectId: string,
		repositoryId: string,
	): Promise<SuggestionCreatePrCandidate[]>;
	createSuggestionBatch(input: {
		projectId: string;
		repositoryId: string;
		createdByUserId: string;
		baseBranch: string;
		baseSha: string;
		headBranch: string;
		summary: Record<string, unknown>;
	}): Promise<{ id: string }>;
	completeSuggestionBatch(input: {
		batchId: string;
		prNumber: number;
		prUrl: string;
		headBranch: string;
		summary: Record<string, unknown>;
	}): Promise<void>;
	failSuggestionBatch(input: {
		batchId: string;
		error: string;
		summary: Record<string, unknown>;
	}): Promise<void>;
	markSuggestionsApplied(suggestionIds: readonly string[], batchId: string): Promise<void>;
	markSuggestionsExcluded(suggestions: readonly CreateSuggestionsPrExcludedItem[]): Promise<void>;
}
