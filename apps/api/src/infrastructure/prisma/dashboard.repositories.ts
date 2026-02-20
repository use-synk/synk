import { db } from "@synk-ai/db";
import { HTTPException } from "hono/http-exception";
import type {
	AuthorizationRepository,
	DashboardRepository,
	RunRepository,
} from "../../domain/ports/index.js";

export type DashboardRepositories = {
	authorizationRepository: AuthorizationRepository;
	dashboardRepository: DashboardRepository;
	runRepository: RunRepository;
};

export const createPrismaDashboardRepositories = (): DashboardRepositories => {
	const assertAccess = (hasAccess: boolean, message: string): void => {
		if (!hasAccess) {
			throw new HTTPException(403, { message });
		}
	};

	const authorizationRepository: AuthorizationRepository = {
		hasInstallationAccess: async ({ installationId, userId }) => {
			const installation = await db.providerInstallation.findFirst({
				where: {
					id: installationId,
					organization: { members: { some: { userId } } },
				},
				select: { id: true },
			});
			return installation !== null;
		},
		hasRepositoryAccess: async ({ repositoryId, userId }) => {
			const repository = await db.providerRepository.findFirst({
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
			const run = await db.analysisRun.findFirst({
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
			db.providerRepository.update({
				where: { id: repositoryId },
				data: {
					...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
				},
			}),
		listInstallationRepositories: async ({ installationId, pagination }) => {
			const skip = (pagination.page - 1) * pagination.pageSize;
			const [total, items] = await Promise.all([
				db.providerRepository.count({ where: { installationId } }),
				db.providerRepository.findMany({
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
				db.analysisRun.count({ where }),
				db.analysisRun.findMany({
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
			db.providerRepository.findUnique({
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
			db.analysisRun.findUnique({
				where: { id: runId },
			}),
	};

	return {
		authorizationRepository,
		dashboardRepository,
		runRepository,
	};
};
