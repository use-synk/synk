import type { db } from "@synk-ai/db";
import type { OrganizationRepository } from "../../domain/ports";

type PrismaOrganizationClient = Pick<
	typeof db,
	"organization" | "providerInstallation" | "providerRepository" | "project"
>;

export const createPrismaOrganizationRepository = (
	client: PrismaOrganizationClient,
): OrganizationRepository => ({
	findOrganizationSlug: async (organizationId) => {
		return await client.organization
			.findUniqueOrThrow({
				where: {
					id: organizationId,
				},
				select: {
					slug: true,
				},
			})
			.then((organization) => organization.slug);
	},
	findOrganizationBySlug: async (slug) => {
		return await client.organization.findUnique({
			where: { slug },
		});
	},
	listOrganizationsForUser: async (userId) => {
		return await client.organization.findMany({
			where: {
				members: {
					some: {
						userId,
					},
				},
			},
			orderBy: {
				name: "asc",
			},
			select: {
				id: true,
				name: true,
				slug: true,
				logo: true,
			},
		});
	},
	listOrganizationsWithProjectsForUser: async (userId) => {
		return await client.organization.findMany({
			where: {
				members: {
					some: {
						userId,
					},
				},
			},
			orderBy: {
				name: "asc",
			},
			select: {
				id: true,
				name: true,
				slug: true,
				logo: true,
				projects: {
					orderBy: {
						name: "asc",
					},
					select: {
						id: true,
						name: true,
					},
				},
			},
		});
	},
	getHasInstallations: async (organizationId) => {
		return (
			(await client.providerInstallation.count({
				where: { organizationId, status: "active" },
			})) > 0
		);
	},
	getHasRepositories: async (organizationId) => {
		return (
			(await client.providerRepository.count({
				where: {
					installation: {
						organizationId,
						status: "active",
					},
				},
			})) > 0
		);
	},
	getHasProjects: async (organizationId) => {
		return (
			(await client.project.count({
				where: { organizationId },
			})) > 0
		);
	},
});
