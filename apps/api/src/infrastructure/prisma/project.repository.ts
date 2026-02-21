import type { db } from "@synk-ai/db";
import type { ProjectRepository } from "../../domain/ports";

type PrismaProjectClient = Pick<typeof db, "project">;

export const createPrismaProjectRepository = (client: PrismaProjectClient): ProjectRepository => ({
	findProject: async (projectId) => {
		return await client.project.findUnique({
			where: { id: projectId },
		});
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
});
