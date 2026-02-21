import type { Organization } from "@synk-ai/db/client";

export interface OrganizationRepository {
	/**
	 * @throws {NotFoundError} if the organization is not found
	 */
	findOrganizationSlug(organizationId: string): Promise<string>;
	findOrganizationBySlug(slug: string): Promise<Organization | null>;
}
