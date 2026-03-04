import type { PaginatedResult, RepositoryListItem } from "../models";
import type { Project, ProjectDetail } from "../models/project";
import type {
	SuggestionDetail,
	SuggestionListFilter,
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
}
