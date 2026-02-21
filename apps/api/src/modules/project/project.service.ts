import type { PaginatedResult } from "../../domain";
import type { Project } from "../../domain/models/project";
import type {
	CreateProjectInput,
	DeleteProjectInput,
	FindProjectInput,
	ListProjectsInput,
	ProjectServiceContract,
	ProjectServiceDependencies,
	UpdateProjectInput,
} from "../../domain/services/project-service";

export class ProjectService implements ProjectServiceContract {
	constructor(private readonly deps: ProjectServiceDependencies) {}

	createProject(input: CreateProjectInput) {
		this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId: input.organizationId,
			userId: input.userId,
		});

		return this.deps.projectRepository.createProject({
			name: input.name,
			organizationId: input.organizationId,
			sourceRepositoryId: input.sourceRepositoryId,
			docsRepositoryId: input.docsRepositoryId,
		});
	}

	deleteProject(input: DeleteProjectInput): Promise<void> {
		this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId: input.organizationId,
			userId: input.userId,
		});

		return Promise.resolve();
	}

	findProject(input: FindProjectInput): Promise<Project | null> {
		this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId: input.organizationId,
			userId: input.userId,
		});

		return this.deps.projectRepository.findProject(input.projectId);
	}

	listProjects(input: ListProjectsInput): Promise<PaginatedResult<Project>> {
		this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId: input.organizationId,
			userId: input.userId,
		});

		return this.deps.projectRepository.listProjects({
			organizationId: input.organizationId,
			pagination: input.pagination,
		});
	}

	updateProject(input: UpdateProjectInput): Promise<Project> {
		this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId: input.organizationId,
			userId: input.userId,
		});

		return this.deps.projectRepository.updateProject({
			projectId: input.projectId,
			patch: input.patch,
		});
	}
}
