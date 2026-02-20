import { db } from "@synk-ai/db";
import type { runStatusSchema } from "@synk-ai/shared";
import { HTTPException } from "hono/http-exception";
import type z from "zod";
import type { AnalyzeChangesEnqueuer } from "../../queues/analyze-changes.js";
import type { patchRepositoryBodySchema } from "./dashboard.schemas.js";

export class DashboardService {
	/**
	 * Updates the repository activation
	 *
	 * Checks if the user has access to the repository and then updates the repository activation.
	 * Throws an error if the user does not have access.
	 *
	 * @TODO Let users update other fields like docs config in the future.
	 *
	 * @param repositoryId
	 * @param userId
	 * @param data
	 *
	 * @returns The updated repository.
	 */
	async patchRepository(
		repositoryId: string,
		userId: string,
		data: z.infer<typeof patchRepositoryBodySchema>,
	) {
		const hasAccess = await this.hasRepositoryAccess(repositoryId, userId);

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this repository",
			});
		}

		return await db.providerRepository.update({
			where: { id: repositoryId },
			data: {
				...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
			},
		});
	}

	/**
	 * Lists repositories for a given installation.
	 *
	 * Checks if the user has access to the installation and then lists the
	 * repositories which are connected to the installation. Throws an error
	 * if the user does not have access.
	 *
	 * @param installationId - The ID of the installation.
	 * @param userId - The ID of the user.
	 * @param page - The page number.
	 * @param pageSize - The number of repositories per page.
	 *
	 * @returns List of repositories and the total number of repositories.
	 */
	async listInstallationRepositories(
		installationId: string,
		userId: string,
		page: number,
		pageSize: number,
	) {
		const hasAccess = await this.hasInstallationAccess(installationId, userId);

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this installation",
			});
		}

		const skip = (page - 1) * pageSize;

		const [total, repositories] = await Promise.all([
			db.providerRepository.count({ where: { installationId } }),
			db.providerRepository.findMany({
				where: { installationId },
				orderBy: { updatedAt: "desc" },
				skip,
				take: pageSize,
				select: {
					id: true,
					installationId: true,
					fullName: true,
					defaultBranch: true,
					status: true,
					isActive: true,
					docsConfig: true,
					updatedAt: true,
				},
			}),
		]);

		return { repositories, total };
	}

	/**
	 * Lists runs for a given repository.
	 *
	 * Checks if the user has access to the repository and then lists the runs for the
	 * repository under the given status. Throws an error if the user does not have access.
	 *
	 * @param repositoryId - The ID of the repository.
	 * @param userId - The ID of the user.
	 * @param page - The page number.
	 * @param pageSize - The number of runs per page.
	 * @param status - The status of the runs to list.
	 *
	 * @returns List of runs and the total number of runs.
	 */
	async listRepositoryRuns(
		repositoryId: string,
		userId: string,
		filter: {
			page: number;
			pageSize: number;
			status: z.infer<typeof runStatusSchema>[] | undefined;
		},
	) {
		const hasAccess = await this.hasRepositoryAccess(repositoryId, userId);

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this repository",
			});
		}

		const { page, pageSize, status } = filter;
		const where = {
			repositoryId,
			...(status === undefined ? {} : { status: { in: status } }),
		};

		const skip = (page - 1) * pageSize;
		const [total, runs] = await Promise.all([
			db.analysisRun.count({ where }),
			db.analysisRun.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip,
				take: pageSize,
				select: {
					id: true,
					status: true,
					triggerType: true,
					triggerRef: true,
					triggerCommitSha: true,
					docsAffected: true,
					docPrUrl: true,
					error: true,
					createdAt: true,
					startedAt: true,
					completedAt: true,
				},
			}),
		]);

		return { runs, total };
	}

	/**
	 * Triggers a manual run for a given repository.
	 *
	 * Checks if the user has access to the repository and then triggers a manual run for the
	 * repository by enqueuing an analysis job.
	 *
	 * @param repositoryId - The ID of the repository.
	 * @param userId - The ID of the user.
	 */
	async triggerManualRun(
		repositoryId: string,
		userId: string,
		enqueueAnalyzeChanges: AnalyzeChangesEnqueuer,
		commitSha: string,
		ref: string | undefined,
	) {
		const hasAccess = await this.hasRepositoryAccess(repositoryId, userId);

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this repository",
			});
		}

		const repository = await db.providerRepository.findUnique({
			where: {
				id: repositoryId,
			},
			select: {
				status: true,
				isActive: true,
				defaultBranch: true,
				installationId: true,
			},
		});

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

		const triggerRef = ref ?? `refs/heads/${defaultBranch}`;
		await enqueueAnalyzeChanges({
			installationId,
			repositoryId,
			trigger: {
				type: "manual",
				ref: triggerRef,
				commitSha,
			},
		});

		return { repository, triggerRef };
	}

	/**
	 * Returns details for a given run.
	 *
	 * @param runId
	 * @param userId
	 */
	async getRunDetail(runId: string, userId: string) {
		const hasAccess = await this.hasRunAccess(runId, userId);

		if (!hasAccess) {
			throw new HTTPException(403, {
				message: "You do not have access to this run",
			});
		}

		const run = await db.analysisRun.findUnique({
			where: {
				id: runId,
			},
		});

		if (!run) {
			throw new HTTPException(404, {
				message: "Run not found",
			});
		}

		return run;
	}

	/* ===============================================================
	 *                         PRIVATE METHODS
	 * =============================================================== */

	/**
	 * Checks if a user has access to an installation.
	 *
	 * Returns true if the user has access to the installation, false otherwise.
	 *
	 * @param installationId
	 * @param userId
	 */
	private async hasInstallationAccess(installationId: string, userId: string) {
		const installation = await db.providerInstallation.findFirst({
			where: {
				id: installationId,
				organization: { members: { some: { userId } } },
			},
		});

		return !!installation;
	}

	/**
	 * Checks if a user has access to a repository.
	 *
	 * Returns true if the user has access to the repository, false otherwise.
	 *
	 * @param repositoryId
	 * @param userId
	 */
	private async hasRepositoryAccess(repositoryId: string, userId: string) {
		const repository = await db.providerRepository.findFirst({
			where: {
				id: repositoryId,
				installation: {
					organization: { members: { some: { userId } } },
				},
			},
			select: {
				id: true,
			},
		});

		return !!repository;
	}

	/**
	 * Checks if a user has access to a run.
	 *
	 * Returns true if the user has access to the run, false otherwise.
	 *
	 * @param runId
	 * @param userId
	 */
	private async hasRunAccess(runId: string, userId: string) {
		const run = await db.analysisRun.findFirst({
			where: {
				id: runId,
				repository: {
					installation: {
						organization: { members: { some: { userId } } },
					},
				},
			},
			select: {
				id: true,
			},
		});

		return !!run;
	}
}
