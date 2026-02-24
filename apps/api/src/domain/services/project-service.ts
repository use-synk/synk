import type { PaginatedResult, Pagination, RepositoryListItem } from "../models";
import type { Project } from "../models/project";
import type { AuthorizationRepository, OrganizationRepository, ProjectRepository } from "../ports";
import type { ProjectPatch } from "../ports/project-repository";

export type ProjectServiceDependencies = {
	authorizationRepository: AuthorizationRepository;
	organizationRepository: OrganizationRepository;
	projectRepository: ProjectRepository;
};

export type CreateProjectInput = {
	userId: string;
	organizationId: string;
	name: string;
	sourceRepositoryId: string;
	docsRepositoryId: string;
};

export type ListProjectsInput = {
	userId: string;
	organizationId: string;
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

export type ListOrganizationRepositoriesInput = {
	userId: string;
	slugOrId: string;
	pagination: Pagination;
};

export interface ProjectServiceContract {
	findProject(input: FindProjectInput): Promise<Project | null>;
	listProjects(input: ListProjectsInput): Promise<PaginatedResult<Project>>;
	listOrganizationRepositories(
		input: ListOrganizationRepositoriesInput,
	): Promise<PaginatedResult<RepositoryListItem>>;
	createProject(input: CreateProjectInput): Promise<Project>;
	updateProject(input: UpdateProjectInput): Promise<Project>;
	deleteProject(input: DeleteProjectInput): Promise<void>;
}
