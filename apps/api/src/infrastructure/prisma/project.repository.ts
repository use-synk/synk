import type { db } from "@synk-ai/db";
import type { ProjectRepository } from "../../domain/ports";

type PrismaProjectClient = Pick<typeof db, "project" | "providerRepository" | "suggestion">;

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
		};
		const [total, items] = await Promise.all([
			client.suggestion.count({ where }),
			client.suggestion.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip,
				take: filter.pageSize,
				select: {
					id: true,
					projectId: true,
					repositoryId: true,
					runId: true,
					docPath: true,
					status: true,
					reasoning: true,
					fingerprint: true,
					supersedesSuggestionId: true,
					decidedByUserId: true,
					decidedAt: true,
					decisionNote: true,
					createdAt: true,
					updatedAt: true,
				},
			}),
		]);
		return { items, total };
	},
	findProjectSuggestion: async (projectId, suggestionId) =>
		client.suggestion.findFirst({
			where: {
				id: suggestionId,
				projectId,
			},
			select: {
				id: true,
				projectId: true,
				repositoryId: true,
				runId: true,
				docPath: true,
				baseDocSha: true,
				beforeContent: true,
				proposedContent: true,
				reasoning: true,
				fingerprint: true,
				status: true,
				supersedesSuggestionId: true,
				decidedByUserId: true,
				decidedAt: true,
				decisionNote: true,
				appliedInBatchId: true,
				createdAt: true,
				updatedAt: true,
			},
		}),
	findProjectSuggestionsByIds: async (projectId, suggestionIds) =>
		client.suggestion.findMany({
			where: {
				projectId,
				id: { in: [...suggestionIds] },
			},
			select: {
				id: true,
				projectId: true,
				repositoryId: true,
				runId: true,
				docPath: true,
				baseDocSha: true,
				beforeContent: true,
				proposedContent: true,
				reasoning: true,
				fingerprint: true,
				status: true,
				supersedesSuggestionId: true,
				decidedByUserId: true,
				decidedAt: true,
				decisionNote: true,
				appliedInBatchId: true,
				createdAt: true,
				updatedAt: true,
			},
		}),
	updateSuggestionDecision: async (suggestionId, patch) =>
		client.suggestion.update({
			where: { id: suggestionId },
			data: patch,
			select: {
				id: true,
				projectId: true,
				repositoryId: true,
				runId: true,
				docPath: true,
				baseDocSha: true,
				beforeContent: true,
				proposedContent: true,
				reasoning: true,
				fingerprint: true,
				status: true,
				supersedesSuggestionId: true,
				decidedByUserId: true,
				decidedAt: true,
				decisionNote: true,
				appliedInBatchId: true,
				createdAt: true,
				updatedAt: true,
			},
		}),
	updateSuggestionsDecision: async (suggestionIds, patch) => {
		await client.suggestion.updateMany({
			where: {
				id: { in: [...suggestionIds] },
			},
			data: patch,
		});
	},
});
