import { HTTPException } from "hono/http-exception";
import type {
	DashboardServiceContract,
	DashboardServiceDependencies,
	ListInstallationRepositoriesInput,
	ListRepositoryRunsInput,
	PatchRepositoryInput,
	TriggerManualRunInput,
} from "../../domain/services/dashboard-service.js";

export class DashboardService implements DashboardServiceContract {
	constructor(private readonly deps: DashboardServiceDependencies) {}

	async patchRepository(input: PatchRepositoryInput) {
		const hasAccess = await this.deps.authorizationRepository.hasRepositoryAccess({
			repositoryId: input.repositoryId,
			userId: input.userId,
		});
		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this repository",
			});
		}

		return this.deps.dashboardRepository.updateRepository({
			repositoryId: input.repositoryId,
			patch: {
				...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
			},
		});
	}

	async listInstallationRepositories(input: ListInstallationRepositoriesInput) {
		const hasAccess = await this.deps.authorizationRepository.hasInstallationAccess({
			installationId: input.installationId,
			userId: input.userId,
		});

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this installation",
			});
		}

		return this.deps.dashboardRepository.listInstallationRepositories({
			installationId: input.installationId,
			pagination: {
				page: input.page,
				pageSize: input.pageSize,
			},
		});
	}

	async listRepositoryRuns(input: ListRepositoryRunsInput) {
		const hasAccess = await this.deps.authorizationRepository.hasRepositoryAccess({
			repositoryId: input.repositoryId,
			userId: input.userId,
		});

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this repository",
			});
		}

		return this.deps.dashboardRepository.listRepositoryRuns({
			repositoryId: input.repositoryId,
			filter: {
				page: input.page,
				pageSize: input.pageSize,
				...(input.status === undefined ? {} : { status: input.status }),
			},
		});
	}

	async triggerManualRun(input: TriggerManualRunInput) {
		const hasAccess = await this.deps.authorizationRepository.hasRepositoryAccess({
			repositoryId: input.repositoryId,
			userId: input.userId,
		});

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this repository",
			});
		}

		const repository = await this.deps.dashboardRepository.findRepositoryForManualRun(
			input.repositoryId,
		);

		if (!repository) {
			throw new HTTPException(404, {
				message: "Repository not found",
			});
		}

		const { status, isActive, defaultBranch, installationId } = repository;

		if (status !== "active" || !isActive) {
			throw new HTTPException(409, {
				message: "Cannot trigger a run for an inactive repository",
			});
		}

		const triggerRef = input.ref ?? `refs/heads/${defaultBranch}`;
		await this.deps.enqueueAnalyzeChanges({
			installationId,
			repositoryId: input.repositoryId,
			trigger: {
				type: "manual",
				ref: triggerRef,
				commitSha: input.commitSha,
			},
		});

		return {
			repositoryId: input.repositoryId,
			triggerType: "manual" as const,
			triggerRef,
			triggerCommitSha: input.commitSha,
			accepted: true as const,
		};
	}

	async getRunDetail(runId: string, userId: string) {
		const hasAccess = await this.deps.authorizationRepository.hasRunAccess({
			runId,
			userId,
		});

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this run",
			});
		}

		const run = await this.deps.runRepository.findRunDetail(runId);

		if (!run) {
			throw new HTTPException(404, {
				message: "Run not found",
			});
		}

		return run;
	}
}
