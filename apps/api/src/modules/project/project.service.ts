import type { PaginatedResult } from "../../domain";
import type { Project } from "../../domain/models/project";
import type {
	CreateProjectInput,
	DeleteProjectInput,
	FindProjectInput,
	ListOrganizationRepositoriesInput,
	ListProjectsInput,
	ProjectServiceContract,
	ProjectServiceDependencies,
	UpdateProjectInput,
} from "../../domain/services/project-service";
import { resolveOrganizationId } from "../../domain/utils";

export class ProjectService implements ProjectServiceContract {
	constructor(private readonly deps: ProjectServiceDependencies) {}

	async createProject(input: CreateProjectInput) {
		const organizationId = await resolveOrganizationId(
			input.slugOrId,
			this.deps.organizationRepository,
		);

		await this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId,
			userId: input.userId,
		});

		return this.deps.projectRepository.createProject({
			name: input.name,
			organizationId,
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

	async listOrganizationRepositories(input: ListOrganizationRepositoriesInput) {
		const organizationId = await resolveOrganizationId(
			input.slugOrId,
			this.deps.organizationRepository,
		);

		await this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId,
			userId: input.userId,
		});

		return this.deps.projectRepository.listOrganizationRepositories({
			organizationId,
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
