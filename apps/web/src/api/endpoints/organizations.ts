import z from "zod";
import { ValidationError } from "../errors";
import { paginationResultSchema } from "../shared";
import type { ApiQuery } from "../types";

export type OrganizationSetupStatus = {
	hasInstallations: boolean;
	hasRepositories: boolean;
	hasProjects: boolean;
};

export type UserOrganization = {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
};

export type UserProjectsByOrganization = {
	organization: {
		id: string;
		name: string;
		slug: string;
		image: string | null;
	};
	projects: Array<{
		id: string;
		name: string;
	}>;
};

export function listUserOrganizations() {
	return {
		url: "/organizations",
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					slug: z.string(),
					logo: z.string().nullable(),
				}),
			),
		}),
		key: ["organizations", "me"],
	} satisfies ApiQuery;
}

export function listUserProjectsByOrganization() {
	return {
		url: "/organizations/projects",
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.array(
				z.object({
					organization: z.object({
						id: z.string(),
						name: z.string(),
						slug: z.string(),
						image: z.string().nullable(),
					}),
					projects: z.array(
						z.object({
							id: z.string(),
							name: z.string(),
						}),
					),
				}),
			),
		}),
		key: ["organizations", "projects", "grouped"],
	} satisfies ApiQuery;
}

export function getOrganizationSetupStatus({ slugOrId }: { slugOrId: string }) {
	return {
		url: `/organizations/${slugOrId}/setup`,
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.object({
				hasInstallations: z.boolean(),
				hasRepositories: z.boolean(),
				hasProjects: z.boolean(),
			}),
		}),
		key: ["organizations", slugOrId, "setup"],
	} satisfies ApiQuery;
}

const paginatedOrganizationQueryPropsSchema = z.object({
	slugOrId: z.string().min(1),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).default(10),
});

export function listOrganizationProjects(
	props: z.infer<typeof paginatedOrganizationQueryPropsSchema>,
) {
	const parsed = paginatedOrganizationQueryPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const params = new URLSearchParams({
		page: parsed.data.page.toString(),
		pageSize: parsed.data.pageSize.toString(),
	});

	return {
		url: `/organizations/${parsed.data.slugOrId}/projects?${params.toString()}`,
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					organizationId: z.string(),
					sourceRepositoryId: z.string(),
					docsRepositoryId: z.string().nullable(),
					config: z.record(z.string(), z.unknown()),
					createdAt: z.string(),
					updatedAt: z.string(),
				}),
			),
			pagination: paginationResultSchema,
		}),
		key: [
			"organizations",
			parsed.data.slugOrId,
			"projects",
			`${parsed.data.page}`,
			`${parsed.data.pageSize}`,
		],
	} satisfies ApiQuery;
}

export function listOrganizationRepositories(
	props: z.infer<typeof paginatedOrganizationQueryPropsSchema>,
) {
	const parsed = paginatedOrganizationQueryPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const params = new URLSearchParams({
		page: parsed.data.page.toString(),
		pageSize: parsed.data.pageSize.toString(),
	});

	return {
		url: `/organizations/${parsed.data.slugOrId}/repositories?${params.toString()}`,
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.array(
				z.object({
					id: z.string(),
					installationId: z.string(),
					fullName: z.string(),
					defaultBranch: z.string(),
					status: z.string(),
					isActive: z.boolean(),
					updatedAt: z.string(),
				}),
			),
			pagination: paginationResultSchema,
		}),
		key: [
			"organizations",
			parsed.data.slugOrId,
			"repositories",
			`${parsed.data.page}`,
			`${parsed.data.pageSize}`,
		],
	} satisfies ApiQuery;
}
