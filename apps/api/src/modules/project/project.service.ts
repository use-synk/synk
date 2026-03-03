import { HTTPException } from "hono/http-exception";
import type { PaginatedResult } from "../../domain";
import type { Project, ProjectDetail } from "../../domain/models/project";
import type {
	CreateProjectInput,
	DeleteProjectInput,
	FindProjectInput,
	GetProjectDetailInput,
	ListOrganizationRepositoriesInput,
	ListProjectRunsInput,
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

	async getProjectDetail(input: GetProjectDetailInput): Promise<ProjectDetail> {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});

		const project = await this.deps.projectRepository.findProjectWithRepositories(input.projectId);

		if (!project) {
			throw new HTTPException(404, { message: "Project not found" });
		}

		return project;
	}

	async listProjectRuns(input: ListProjectRunsInput) {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});

		const project = await this.deps.projectRepository.findProject(input.projectId);

		if (!project) {
			throw new HTTPException(404, { message: "Project not found" });
		}

		return this.deps.dashboardRepository.listRepositoryRuns({
			repositoryId: project.sourceRepositoryId,
			filter: input.filter,
		});
	}

	async listProjects(input: ListProjectsInput): Promise<PaginatedResult<Project>> {
		const organizationId = await resolveOrganizationId(
			input.slugOrId,
			this.deps.organizationRepository,
		);

		await this.deps.authorizationRepository.assertOrganizationMembership({
			organizationId,
			userId: input.userId,
		});

		return this.deps.projectRepository.listProjects({
			organizationId,
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
