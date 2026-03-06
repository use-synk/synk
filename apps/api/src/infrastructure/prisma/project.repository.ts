import type { Prisma, db } from "@synk-ai/db";
import type { ProjectRepository } from "../../domain/ports";

type PrismaProjectClient = Pick<
	typeof db,
	"project" | "providerRepository" | "suggestion" | "suggestionBatch"
>;

const decidedByUserSelect = {
	id: true,
	name: true,
	email: true,
	image: true,
} as const;

const suggestionSummarySelect = {
	id: true,
	readableId: true,
	projectId: true,
	repositoryId: true,
	runId: true,
	docPath: true,
	baseDocSha: true,
	status: true,
	title: true,
	reasoning: true,
	fingerprint: true,
	diffAdditions: true,
	diffDeletions: true,
	supersedesSuggestionId: true,
	decidedByUserId: true,
	decidedByUser: { select: decidedByUserSelect },
	decidedAt: true,
	decisionNote: true,
	createdAt: true,
	updatedAt: true,
} as const;

const suggestionDetailSelect = {
	...suggestionSummarySelect,
	beforeContent: true,
	proposedContent: true,
	appliedInBatchId: true,
} as const;

export const createPrismaProjectRepository = (client: PrismaProjectClient): ProjectRepository => ({
	findProject: async (projectId) => {
		return await client.project.findUnique({
			where: { id: projectId },
		});
	},
	findProjectWithRepositories: async (projectId) => {
		const project = await client.project.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				name: true,
				organizationId: true,
				config: true,
				createdAt: true,
				updatedAt: true,
				sourceRepository: {
					select: { id: true, fullName: true, defaultBranch: true, isActive: true },
				},
				docsRepository: {
					select: { id: true, fullName: true, defaultBranch: true, isActive: true },
				},
			},
		});

		if (!project) return null;

		return {
			...project,
			// Prisma.JsonValue is always a plain object here; the DB default is `{}`
			config: project.config as Record<string, unknown>,
		};
	},
	createProject: async (project) => {
		return await client.project.create({
			data: {
				name: project.name,
				organizationId: project.organizationId,
				sourceRepositoryId: project.sourceRepositoryId,
				docsRepositoryId: project.docsRepositoryId,
			},
		});
	},
	listProjects: async ({ organizationId, pagination }) => {
		const skip = (pagination.page - 1) * pagination.pageSize;
		const [total, items] = await Promise.all([
			client.project.count({ where: { organizationId } }),
			client.project.findMany({
				where: { organizationId },
				orderBy: { updatedAt: "desc" },
				skip,
				take: pagination.pageSize,
			}),
		]);
		return { items, total };
	},
	listOrganizationRepositories: async ({ organizationId, pagination }) => {
		const where = {
			installation: {
				organizationId,
				status: "active" as const,
			},
		};
		const skip = (pagination.page - 1) * pagination.pageSize;
		const [total, items] = await Promise.all([
			client.providerRepository.count({ where }),
			client.providerRepository.findMany({
				where,
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
	/**
	 * @todo Add config update
	 */
	updateProject: async ({ projectId, patch }) => {
		return await client.project.update({
			where: { id: projectId },
			data: {
				...(patch.name !== undefined ? { name: patch.name } : {}),
				// ...(patch.config !== undefined ? { config: patch.config } : {}),
				// config: patch.config,
				...(patch.docsRepositoryId !== undefined
					? { docsRepositoryId: patch.docsRepositoryId }
					: {}),
				...(patch.sourceRepositoryId !== undefined
					? { sourceRepositoryId: patch.sourceRepositoryId }
					: {}),
			},
		});
	},
	deleteProject: async (projectId) => {
		return await client.project.delete({
			where: { id: projectId },
		});
	},
	listProjectSuggestions: async (projectId, filter) => {
		const skip = (filter.page - 1) * filter.pageSize;
		const where = {
			projectId,
			...(filter.status !== undefined ? { status: { in: filter.status } } : {}),
			...(filter.search !== undefined && filter.search.length > 0
				? {
						OR: [
							{ title: { contains: filter.search, mode: "insensitive" as const } },
							{ docPath: { contains: filter.search, mode: "insensitive" as const } },
						],
					}
				: {}),
		};
		const [total, items] = await Promise.all([
			client.suggestion.count({ where }),
			client.suggestion.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip,
				take: filter.pageSize,
				select: suggestionSummarySelect,
			}),
		]);
		return { items, total };
	},
	countProjectSuggestionStats: async (projectId) => {
		const counts = await client.suggestion.groupBy({
			by: ["status"],
			where: {
				projectId,
				status: {
					in: ["pending", "accepted"],
				},
			},
			_count: {
				_all: true,
			},
		});

		let pending = 0;
		let accepted = 0;

		for (const item of counts) {
			if (item.status === "pending") {
				pending = item._count._all;
				continue;
			}
			if (item.status === "accepted") {
				accepted = item._count._all;
			}
		}

		return {
			pending,
			accepted,
		};
	},
	findProjectSuggestion: async (projectId, suggestionId) =>
		client.suggestion.findFirst({
			where: {
				id: suggestionId,
				projectId,
			},
			select: suggestionDetailSelect,
		}),
	findProjectSuggestionsByIds: async (projectId, suggestionIds) =>
		client.suggestion.findMany({
			where: {
				projectId,
				id: { in: [...suggestionIds] },
			},
			select: suggestionDetailSelect,
		}),
	updateSuggestionDecision: async (suggestionId, patch) =>
		client.suggestion.update({
			where: { id: suggestionId },
			data: patch,
			select: suggestionDetailSelect,
		}),
	updateSuggestionsDecision: async (suggestionIds, patch) => {
		await client.suggestion.updateMany({
			where: {
				id: { in: [...suggestionIds] },
			},
			data: patch,
		});
	},
	findProjectSuggestionTarget: async (projectId) => {
		const project = await client.project.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				sourceRepository: {
					select: {
						id: true,
						fullName: true,
						defaultBranch: true,
						provider: true,
						installation: {
							select: {
								providerInstallationId: true,
							},
						},
					},
				},
				docsRepository: {
					select: {
						id: true,
						fullName: true,
						defaultBranch: true,
						provider: true,
						installation: {
							select: {
								providerInstallationId: true,
							},
						},
					},
				},
			},
		});
		if (project === null) {
			return null;
		}
		const target = project.docsRepository ?? project.sourceRepository;
		return {
			projectId: project.id,
			repositoryId: target.id,
			repositoryFullName: target.fullName,
			baseBranch: target.defaultBranch,
			provider: target.provider,
			providerInstallationId: target.installation.providerInstallationId,
		};
	},
	listAcceptedSuggestionsForPr: async (projectId, repositoryId) =>
		client.suggestion.findMany({
			where: {
				projectId,
				repositoryId,
				status: "accepted",
				appliedInBatchId: null,
			},
			orderBy: {
				createdAt: "asc",
			},
			select: {
				id: true,
				docPath: true,
				baseDocSha: true,
				proposedContent: true,
				reasoning: true,
			},
		}),
	createSuggestionBatch: async (input) => {
		const created = await client.suggestionBatch.create({
			data: {
				projectId: input.projectId,
				repositoryId: input.repositoryId,
				createdByUserId: input.createdByUserId,
				baseBranch: input.baseBranch,
				baseSha: input.baseSha,
				headBranch: input.headBranch,
				status: "running",
				summary: input.summary as unknown as Prisma.InputJsonValue,
			},
			select: {
				id: true,
			},
		});
		return created;
	},
	completeSuggestionBatch: async (input) => {
		await client.suggestionBatch.update({
			where: { id: input.batchId },
			data: {
				status: "completed",
				prNumber: input.prNumber,
				prUrl: input.prUrl,
				headBranch: input.headBranch,
				summary: input.summary as unknown as Prisma.InputJsonValue,
				error: null,
			},
		});
	},
	failSuggestionBatch: async (input) => {
		await client.suggestionBatch.update({
			where: { id: input.batchId },
			data: {
				status: "failed",
				error: input.error,
				summary: input.summary as unknown as Prisma.InputJsonValue,
			},
		});
	},
	markSuggestionsApplied: async (suggestionIds, batchId) => {
		if (suggestionIds.length === 0) {
			return;
		}
		await client.suggestion.updateMany({
			where: {
				id: { in: [...suggestionIds] },
			},
			data: {
				status: "applied",
				appliedInBatchId: batchId,
			},
		});
	},
	markSuggestionsExcluded: async (suggestions) => {
		if (suggestions.length === 0) {
			return;
		}
		const staleIds = suggestions
			.filter((item) => item.reason === "file-missing" || item.reason === "base-sha-mismatch")
			.map((item) => item.suggestionId);
		if (staleIds.length === 0) {
			return;
		}
		await client.suggestion.updateMany({
			where: {
				id: { in: staleIds },
			},
			data: {
				status: "stale",
			},
		});
	},
});
