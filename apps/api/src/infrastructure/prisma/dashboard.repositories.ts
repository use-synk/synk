import { db } from "@synk-ai/db";
import type {
	AuthorizationRepository,
	DashboardRepository,
	RunRepository,
} from "../../domain/ports/index.js";
import { AccessDeniedError } from "../../domain/errors/access-denied-error.js";

export type DashboardRepositories = {
	authorizationRepository: AuthorizationRepository;
	dashboardRepository: DashboardRepository;
	runRepository: RunRepository;
};

type PrismaDashboardDatabaseClient = Pick<
	typeof db,
	"providerInstallation" | "providerRepository" | "analysisRun"
>;

export const createPrismaDashboardRepositories = (
	client: PrismaDashboardDatabaseClient = db,
): DashboardRepositories => {
	const assertAccess = (hasAccess: boolean, message: string): void => {
		if (!hasAccess) {
			throw new AccessDeniedError(message);
		}
	};

	const authorizationRepository: AuthorizationRepository = {
		hasInstallationAccess: async ({ installationId, userId }) => {
			const installation = await client.providerInstallation.findFirst({
				where: {
					id: installationId,
					organization: { members: { some: { userId } } },
				},
				select: { id: true },
			});
			return installation !== null;
		},
		hasRepositoryAccess: async ({ repositoryId, userId }) => {
			const repository = await client.providerRepository.findFirst({
				where: {
					id: repositoryId,
					installation: {
						organization: { members: { some: { userId } } },
					},
				},
				select: { id: true },
			});
			return repository !== null;
		},
		hasRunAccess: async ({ runId, userId }) => {
			const run = await client.analysisRun.findFirst({
				where: {
					id: runId,
					repository: {
						installation: {
							organization: { members: { some: { userId } } },
						},
					},
				},
				select: { id: true },
			});
			return run !== null;
		},
		assertInstallationAccess: async (query) => {
			const hasAccess = await authorizationRepository.hasInstallationAccess(query);
			assertAccess(hasAccess, "You do not have access to this installation");
		},
		assertRepositoryAccess: async (query) => {
			const hasAccess = await authorizationRepository.hasRepositoryAccess(query);
			assertAccess(hasAccess, "You do not have access to this repository");
		},
		assertRunAccess: async (query) => {
			const hasAccess = await authorizationRepository.hasRunAccess(query);
			assertAccess(hasAccess, "You do not have access to this run");
		},
	};

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
