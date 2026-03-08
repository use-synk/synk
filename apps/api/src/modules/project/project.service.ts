import { createDocUpdatePR, createInstallationOctokit, fetchFileContent } from "@synk-ai/github";
import { HTTPException } from "hono/http-exception";
import type { PaginatedResult } from "../../domain";
import type { Project, ProjectDetail } from "../../domain/models/project";
import type {
	CreateSuggestionsPrExcludedItem,
	CreateSuggestionsPrResult,
	ProjectSuggestionTarget,
	SuggestionCreatePrCandidate,
	SuggestionDetail,
	SuggestionStatus,
} from "../../domain/models/suggestion";
import type {
	BulkDecideProjectSuggestionsInput,
	CreateProjectInput,
	CreateProjectSuggestionsPrInput,
	DecideProjectSuggestionInput,
	DeleteProjectInput,
	FindProjectInput,
	GetProjectDetailInput,
	GetProjectSuggestionInput,
	GetProjectSuggestionStatsInput,
	ListOrganizationRepositoriesInput,
	ListProjectRunsInput,
	ListProjectSuggestionsInput,
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

const parseOwnerAndRepo = (fullName: string): { owner: string; repo: string } => {
	const [owner, repo] = fullName.split("/");
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0) {
		throw new HTTPException(500, { message: `Invalid repository full name '${fullName}'` });
	}
	return { owner, repo };
};

const parseInstallationId = (providerInstallationId: string): number => {
	const parsed = Number.parseInt(providerInstallationId, 10);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new HTTPException(500, {
			message: `Invalid provider installation id '${providerInstallationId}'`,
		});
	}
	return parsed;
};

const isNotFoundError = (error: unknown): boolean =>
	typeof error === "object" && error !== null && "status" in error && error.status === 404;

const buildBatchSummary = (input: {
	includedSuggestionIds: readonly string[];
	excluded: readonly CreateSuggestionsPrExcludedItem[];
}): Record<string, unknown> => ({
	includedCount: input.includedSuggestionIds.length,
	excludedCount: input.excluded.length,
	includedSuggestionIds: [...input.includedSuggestionIds],
	excluded: input.excluded.map((item) => ({
		suggestionId: item.suggestionId,
		docPath: item.docPath,
		reason: item.reason,
	})),
});

const getBaseBranchSha = async (
	target: ProjectSuggestionTarget,
	octokit: ReturnType<typeof createInstallationOctokit>,
): Promise<string> => {
	const { owner, repo } = parseOwnerAndRepo(target.repositoryFullName);
	const ref = await octokit.rest.git.getRef({
		owner,
		repo,
		ref: `heads/${target.baseBranch}`,
	});
	return ref.data.object.sha;
};

const classifySuggestionsForPr = async (input: {
	target: ProjectSuggestionTarget;
	suggestions: readonly SuggestionCreatePrCandidate[];
	octokit: ReturnType<typeof createInstallationOctokit>;
}): Promise<{
	included: {
		suggestionId: string;
		path: string;
		content: string;
		reasoning?: string;
	}[];
	excluded: CreateSuggestionsPrExcludedItem[];
}> => {
	const { owner, repo } = parseOwnerAndRepo(input.target.repositoryFullName);
	const included: {
		suggestionId: string;
		path: string;
		content: string;
		reasoning?: string;
	}[] = [];
	const excluded: CreateSuggestionsPrExcludedItem[] = [];
	for (const suggestion of input.suggestions) {
		try {
			const current = await fetchFileContent(input.octokit, {
				owner,
				repo,
				path: suggestion.docPath,
				ref: input.target.baseBranch,
			});
			if (current.sha !== suggestion.baseDocSha) {
				excluded.push({
					suggestionId: suggestion.id,
					docPath: suggestion.docPath,
					reason: "base-sha-mismatch",
				});
				continue;
			}
			if (current.content === suggestion.proposedContent) {
				excluded.push({
					suggestionId: suggestion.id,
					docPath: suggestion.docPath,
					reason: "already-applied",
				});
				continue;
			}
			included.push({
				suggestionId: suggestion.id,
				path: suggestion.docPath,
				content: suggestion.proposedContent,
				reasoning: suggestion.reasoning ?? undefined,
			});
		} catch (error) {
			if (!isNotFoundError(error)) {
				throw error;
			}
			excluded.push({
				suggestionId: suggestion.id,
				docPath: suggestion.docPath,
				reason: "file-missing",
			});
		}
	}
	return { included, excluded };
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

	async getProjectSuggestionStats(input: GetProjectSuggestionStatsInput) {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});
		return this.deps.projectRepository.countProjectSuggestionStats(input.projectId);
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

	async createProjectSuggestionsPr(
		input: CreateProjectSuggestionsPrInput,
	): Promise<CreateSuggestionsPrResult> {
		await this.deps.authorizationRepository.assertProjectAccess({
			projectId: input.projectId,
			userId: input.userId,
		});
		const target = await this.deps.projectRepository.findProjectSuggestionTarget(input.projectId);
		if (target === null) {
			throw new HTTPException(404, { message: "Project not found" });
		}
		if (target.provider !== "github") {
			throw new HTTPException(400, { message: "Only GitHub repositories are currently supported" });
		}

		const suggestions = await this.deps.projectRepository.listAcceptedSuggestionsForPr(
			input.projectId,
			target.repositoryId,
		);
		if (suggestions.length === 0) {
			throw new HTTPException(409, {
				message: "No accepted suggestions available for PR creation",
			});
		}
		const installationId = parseInstallationId(target.providerInstallationId);
		const octokit = createInstallationOctokit(installationId, this.deps.githubCredentials);
		const baseSha = await getBaseBranchSha(target, octokit);

		const { included, excluded } = await classifySuggestionsForPr({
			target,
			suggestions,
			octokit,
		});
		const batch = await this.deps.projectRepository.createSuggestionBatch({
			projectId: input.projectId,
			repositoryId: target.repositoryId,
			createdByUserId: input.userId,
			baseBranch: target.baseBranch,
			baseSha,
			headBranch: "pending",
			summary: buildBatchSummary({
				includedSuggestionIds: included.map((item) => item.suggestionId),
				excluded,
			}),
		});

		try {
			if (included.length === 0) {
				await this.deps.projectRepository.markSuggestionsExcluded(excluded);
				await this.deps.projectRepository.failSuggestionBatch({
					batchId: batch.id,
					error: "No valid accepted suggestions remained after revalidation",
					summary: buildBatchSummary({
						includedSuggestionIds: [],
						excluded,
					}),
				});
				return {
					batchId: batch.id,
					status: "failed",
					prNumber: null,
					prUrl: null,
					includedSuggestionIds: [],
					excluded,
				};
			}

			const { owner, repo } = parseOwnerAndRepo(target.repositoryFullName);
			const prResult = await createDocUpdatePR(octokit, {
				owner,
				repo,
				baseBranch: target.baseBranch,
				files: included.map((item) => ({
					path: item.path,
					content: item.content,
					reasoning: item.reasoning,
				})),
				triggerInfo: {
					type: "manual",
					ref: `refs/heads/${target.baseBranch}`,
					commitSha: baseSha,
					sourceOwner: owner,
					sourceRepo: repo,
				},
			});

			await this.deps.projectRepository.markSuggestionsApplied(
				included.map((item) => item.suggestionId),
				batch.id,
			);
			await this.deps.projectRepository.markSuggestionsExcluded(excluded);
			await this.deps.projectRepository.completeSuggestionBatch({
				batchId: batch.id,
				prNumber: prResult.prNumber,
				prUrl: prResult.prUrl,
				headBranch: prResult.branchName,
				summary: buildBatchSummary({
					includedSuggestionIds: included.map((item) => item.suggestionId),
					excluded,
				}),
			});

			return {
				batchId: batch.id,
				status: "completed",
				prNumber: prResult.prNumber,
				prUrl: prResult.prUrl,
				includedSuggestionIds: included.map((item) => item.suggestionId),
				excluded,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown batch creation failure";
			await this.deps.projectRepository.failSuggestionBatch({
				batchId: batch.id,
				error: message,
				summary: buildBatchSummary({
					includedSuggestionIds: included.map((item) => item.suggestionId),
					excluded,
				}),
			});
			throw error;
		}
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
