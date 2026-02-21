import type { db } from "@synk-ai/db";
import type { OrganizationRepository } from "../../domain/ports";

type PrismaOrganizationClient = Pick<typeof db, "organization">;

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
});
