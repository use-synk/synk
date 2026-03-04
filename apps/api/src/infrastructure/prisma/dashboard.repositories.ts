import { db } from "@synk-ai/db";
import type { DashboardRepository, RunRepository } from "../../domain/ports/index";

export type DashboardRepositories = {
	dashboardRepository: DashboardRepository;
	runRepository: RunRepository;
};

type PrismaDashboardDatabaseClient = Pick<
	typeof db,
	"providerInstallation" | "providerRepository" | "analysisRun" | "member"
>;

export const createPrismaDashboardRepositories = (
	client: PrismaDashboardDatabaseClient = db,
): DashboardRepositories => {
	const dashboardRepository: DashboardRepository = {
		updateRepository: async ({ repositoryId, patch }) => {
			return await client.providerRepository.update({
				where: { id: repositoryId },
				data: {
					...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
				},
				select: {
					id: true,
					installationId: true,
					fullName: true,
					defaultBranch: true,
					status: true,
					isActive: true,
					createdAt: true,
					updatedAt: true,
				},
			});
		},
		listInstallationRepositories: async ({ installationId, pagination }) => {
			const skip = (pagination.page - 1) * pagination.pageSize;
			const [total, items] = await Promise.all([
				client.providerRepository.count({ where: { installationId } }),
				client.providerRepository.findMany({
					where: { installationId },
					orderBy: { updatedAt: "desc" },
					skip,
					take: pagination.pageSize,
					select: {
						id: true,
						installationId: true,
						fullName: true,
						defaultBranch: true,
						status: true,
						isActive: true,
						updatedAt: true,
					},
				}),
			]);
			return { items, total };
		},
		listRepositoryRuns: async ({ repositoryId, filter }) => {
			const where =
				filter.status === undefined
					? { repositoryId }
					: { repositoryId, status: { in: [...filter.status] } };
			const skip = (filter.page - 1) * filter.pageSize;
			const [total, rows] = await Promise.all([
				client.analysisRun.count({ where }),
				client.analysisRun.findMany({
					where,
					orderBy: { createdAt: "desc" },
					skip,
					take: filter.pageSize,
					select: {
						id: true,
						status: true,
						triggerType: true,
						triggerRef: true,
						triggerCommitSha: true,
						docsAffected: true,
						docPrUrl: true,
						error: true,
						provider: true,
						createdAt: true,
						startedAt: true,
						completedAt: true,
						repository: {
							select: {
								fullName: true,
							},
						},
					},
				}),
			]);
			const items = rows.map(({ provider, repository, ...rest }) => ({
				...rest,
				repository: {
					fullName: repository.fullName,
					provider,
				},
			}));
			return { items, total };
		},
		findRepositoryForManualRun: async (repositoryId) =>
			client.providerRepository.findUnique({
				where: { id: repositoryId },
				select: {
					status: true,
					isActive: true,
					defaultBranch: true,
					installationId: true,
				},
			}),
	};

	const runRepository: RunRepository = {
		findRunDetail: async (runId) => {
			const row = await client.analysisRun.findUnique({
				where: { id: runId },
				select: {
					id: true,
					repositoryId: true,
					provider: true,
					status: true,
					triggerType: true,
					triggerRef: true,
					triggerCommitSha: true,
					triggerMergeRequestNumber: true,
					triggerMeta: true,
					result: true,
					docsAffected: true,
					docPrNumber: true,
					docPrUrl: true,
					tokenUsage: true,
					error: true,
					attemptCount: true,
					queuedAt: true,
					startedAt: true,
					completedAt: true,
					createdAt: true,
					updatedAt: true,
					repository: {
						select: {
							fullName: true,
						},
					},
				},
			});
			if (!row) return null;
			const { provider, repository, ...rest } = row;
			return {
				...rest,
				repository: {
					fullName: repository.fullName,
					provider,
				},
			};
		},
	};

	return {
		dashboardRepository,
		runRepository,
	};
};
