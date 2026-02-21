import { db } from "@synk-ai/db";
import type {
	AuthorizationRepository,
	DashboardRepository,
	RunRepository,
} from "../../domain/ports/index";
import { createPrismaAuthorizationRepository } from "./authorization.repository";

export type DashboardRepositories = {
	authorizationRepository: AuthorizationRepository;
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
	// TODO: Extract to a separate function
	const authorizationRepository: AuthorizationRepository =
		createPrismaAuthorizationRepository(client);

	const dashboardRepository: DashboardRepository = {
		updateRepository: async ({ repositoryId, patch }) =>
			client.providerRepository.update({
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
					docsConfig: true,
					createdAt: true,
					updatedAt: true,
				},
			}),
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
						docsConfig: true,
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
			const [total, items] = await Promise.all([
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
						createdAt: true,
						startedAt: true,
						completedAt: true,
					},
				}),
			]);
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
		findRunDetail: async (runId) =>
			client.analysisRun.findUnique({
				where: { id: runId },
			}),
	};

	return {
		authorizationRepository,
		dashboardRepository,
		runRepository,
	};
};
