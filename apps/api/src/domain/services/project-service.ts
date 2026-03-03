import type { PaginatedResult, Pagination, RepositoryListItem, RunListFilter, RunListItem } from "../models";
import type { Project, ProjectDetail } from "../models/project";
import type { AuthorizationRepository, OrganizationRepository, ProjectRepository } from "../ports";
import type { DashboardRepository } from "../ports/dashboard-repository";
import type { ProjectPatch } from "../ports/project-repository";

export type ProjectServiceDependencies = {
	authorizationRepository: AuthorizationRepository;
	organizationRepository: OrganizationRepository;
	projectRepository: ProjectRepository;
	dashboardRepository: DashboardRepository;
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

export interface ProjectServiceContract {
	findProject(input: FindProjectInput): Promise<Project | null>;
	getProjectDetail(input: GetProjectDetailInput): Promise<ProjectDetail>;
	listProjects(input: ListProjectsInput): Promise<PaginatedResult<Project>>;
	listOrganizationRepositories(
		input: ListOrganizationRepositoriesInput,
	): Promise<PaginatedResult<RepositoryListItem>>;
	listProjectRuns(input: ListProjectRunsInput): Promise<PaginatedResult<RunListItem>>;
	createProject(input: CreateProjectInput): Promise<Project>;
	updateProject(input: UpdateProjectInput): Promise<Project>;
	deleteProject(input: DeleteProjectInput): Promise<void>;
}
