import type { Organization } from "@synk-ai/db/client";

export type UserOrganizationListItem = Pick<Organization, "id" | "name" | "slug" | "logo">;
export type UserOrganizationProjectsListItem = UserOrganizationListItem & {
	projects: Array<{
		id: string;
		name: string;
	}>;
};

export interface OrganizationRepository {
	/**
	 * @throws {NotFoundError} if the organization is not found
	 */
	findOrganizationSlug(organizationId: string): Promise<string>;
	findOrganizationBySlug(slug: string): Promise<Organization | null>;
	listOrganizationsForUser(userId: string): Promise<UserOrganizationListItem[]>;
	listOrganizationsWithProjectsForUser(userId: string): Promise<UserOrganizationProjectsListItem[]>;

	getHasInstallations(organizationId: string): Promise<boolean>;
	getHasRepositories(organizationId: string): Promise<boolean>;
	getHasProjects(organizationId: string): Promise<boolean>;
}
