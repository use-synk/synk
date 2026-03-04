import { HTTPException } from "hono/http-exception";
import type { PaginatedResult } from "../../domain";
import type { Project, ProjectDetail } from "../../domain/models/project";
import type { SuggestionDetail, SuggestionStatus } from "../../domain/models/suggestion";
import type {
	BulkDecideProjectSuggestionsInput,
	CreateProjectInput,
	DecideProjectSuggestionInput,
	DeleteProjectInput,
	FindProjectInput,
	GetProjectSuggestionInput,
	GetProjectDetailInput,
	ListProjectSuggestionsInput,
	ListOrganizationRepositoriesInput,
	ListProjectRunsInput,
	ListProjectsInput,
	ProjectServiceContract,
	ProjectServiceDependencies,
	UpdateProjectInput,
} from "../../domain/services/project-service";
import { resolveOrganizationId } from "../../domain/utils";

const assertDecisionTransition = (
	currentStatus: SuggestionStatus,
	decision: "accept" | "decline" | "reset",
): void => {
	if (currentStatus === "superseded" || currentStatus === "stale" || currentStatus === "applied") {
		throw new HTTPException(409, {
			message: `Cannot ${decision} suggestion with status '${currentStatus}'`,
		});
	}
};

const buildDecisionPatch = (input: {
	decision: "accept" | "decline" | "reset";
	userId: string;
	note?: string;
}) => {
	if (input.decision === "reset") {
		return {
			status: "pending" as const,
			decidedByUserId: null,
			decidedAt: null,
			decisionNote: null,
		};
	}
	return {
		status: input.decision === "accept" ? ("accepted" as const) : ("declined" as const),
		decidedByUserId: input.userId,
		decidedAt: new Date(),
		decisionNote: input.note ?? null,
	};
};

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

	async listProjectSuggestions(input: ListProjectSuggestionsInput) {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});
		return this.deps.projectRepository.listProjectSuggestions(input.projectId, input.filter);
	}

	async getProjectSuggestion(input: GetProjectSuggestionInput): Promise<SuggestionDetail> {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});
		const suggestion = await this.deps.projectRepository.findProjectSuggestion(
			input.projectId,
			input.suggestionId,
		);
		if (suggestion === null) {
			throw new HTTPException(404, { message: "Suggestion not found" });
		}
		return suggestion;
	}

	async decideProjectSuggestion(input: DecideProjectSuggestionInput): Promise<SuggestionDetail> {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});
		const suggestion = await this.deps.projectRepository.findProjectSuggestion(
			input.projectId,
			input.suggestionId,
		);
		if (suggestion === null) {
			throw new HTTPException(404, { message: "Suggestion not found" });
		}
		assertDecisionTransition(suggestion.status, input.decision);
		const patch = buildDecisionPatch({
			decision: input.decision,
			userId: input.userId,
			note: input.note,
		});
		return this.deps.projectRepository.updateSuggestionDecision(input.suggestionId, patch);
	}

	async bulkDecideProjectSuggestions(
		input: BulkDecideProjectSuggestionsInput,
	): Promise<SuggestionDetail[]> {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});
		const suggestionIds = [...new Set(input.suggestionIds)];
		const suggestions = await this.deps.projectRepository.findProjectSuggestionsByIds(
			input.projectId,
			suggestionIds,
		);
		if (suggestions.length !== suggestionIds.length) {
			throw new HTTPException(404, { message: "One or more suggestions were not found" });
		}
		for (const suggestion of suggestions) {
			assertDecisionTransition(suggestion.status, input.decision);
		}
		const patch = buildDecisionPatch({
			decision: input.decision,
			userId: input.userId,
			note: input.note,
		});
		await this.deps.projectRepository.updateSuggestionsDecision(suggestionIds, patch);
		return this.deps.projectRepository.findProjectSuggestionsByIds(input.projectId, suggestionIds);
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
