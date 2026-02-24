import type { PaginatedResult } from "../models";
import type { Project } from "../models/project";

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

export type ProjectPatch = Partial<
	Pick<Project, "name" | "config" | "docsRepositoryId" | "sourceRepositoryId">
>;

export type UpdateProjectCommand = {
	projectId: string;
	patch: ProjectPatch;
};

export interface ProjectRepository {
	findProject(projectId: string): Promise<Project | null>;
	listProjects(query: ListProjectsQuery): Promise<PaginatedResult<Project>>;
	createProject(project: CreateProjectInput): Promise<Project>;
	updateProject(command: UpdateProjectCommand): Promise<Project>;
	deleteProject(projectId: string): Promise<Project>;
}
