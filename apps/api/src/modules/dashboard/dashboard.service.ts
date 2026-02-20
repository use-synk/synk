import { HTTPException } from "hono/http-exception";
import type {
	DashboardServiceContract,
	DashboardServiceDependencies,
	ListInstallationRepositoriesInput,
	ListRepositoryRunsInput,
	PatchRepositoryInput,
	TriggerManualRunInput,
} from "../../domain/services/dashboard-service";

export class DashboardService implements DashboardServiceContract {
	constructor(private readonly deps: DashboardServiceDependencies) {}

	async patchRepository(input: PatchRepositoryInput) {
		return this.deps.unitOfWork.withTransaction(async (repositories) => {
			await repositories.authorizationRepository.assertRepositoryAccess({
				repositoryId: input.repositoryId,
				userId: input.userId,
			});

			return repositories.dashboardRepository.updateRepository({
				repositoryId: input.repositoryId,
				patch: {
					...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
				},
			});
		});
	}

	async listInstallationRepositories(input: ListInstallationRepositoriesInput) {
		await this.deps.authorizationRepository.assertInstallationAccess({
			installationId: input.installationId,
			userId: input.userId,
		});

		return this.deps.dashboardRepository.listInstallationRepositories({
			installationId: input.installationId,
			pagination: input.pagination,
		});
	}

	async listRepositoryRuns(input: ListRepositoryRunsInput) {
		await this.deps.authorizationRepository.assertRepositoryAccess({
			repositoryId: input.repositoryId,
			userId: input.userId,
		});

		return this.deps.dashboardRepository.listRepositoryRuns({
			repositoryId: input.repositoryId,
			filter: input.filter,
		});
	}

	async triggerManualRun(input: TriggerManualRunInput) {
		await this.deps.authorizationRepository.assertRepositoryAccess({
			repositoryId: input.repositoryId,
			userId: input.userId,
		});

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
		await this.deps.authorizationRepository.assertRunAccess({
			runId,
			userId,
		});

		const run = await this.deps.runRepository.findRunDetail(runId);

		if (!run) {
			throw new HTTPException(404, {
				message: "Run not found",
			});
		}

		return run;
	}
}
