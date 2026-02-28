import { type ApiContract, defineEndpoint } from "@/lib/api";
import z from "zod";
import { paginationResultSchema } from "./schemas";

export const projectRoutes = {
	"/projects": {
		/**
		 * POST /projects
		 *
		 * Creates a new project within an organization. The caller must be a member
		 * of the specified organization.
		 *
		 * @throws 400 if the request body is invalid.
		 * @throws 403 if the user is not a member of the target organization.
		 */
		POST: defineEndpoint({
			method: "POST",
			body: z.object({
				name: z.string().min(1),
				slugOrId: z.string().min(1),
				sourceRepositoryId: z.string().min(1),
				docsRepositoryId: z.string().min(1),
			}),
			response: z.object({
				data: z.object({
					id: z.string(),
					name: z.string(),
					organizationId: z.string(),
					sourceRepositoryId: z.string(),
					docsRepositoryId: z.string().nullable(),
					config: z.record(z.string(), z.unknown()),
					createdAt: z.string(),
					updatedAt: z.string(),
				}),
			}),
			key: () => ["projects", "create"],
		}),
	},
	"/organizations/:organizationId/projects": {
		GET: defineEndpoint({
			method: "GET",
			params: z.object({
				organizationId: z.string(),
			}),
			query: z.object({
				page: z.number(),
				pageSize: z.number(),
			}),
			response: z.object({
				data: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						organizationId: z.string(),
						sourceRepositoryId: z.string(),
						docsRepositoryId: z.string(),
						createdAt: z.string(),
						updatedAt: z.string(),
						config: z.record(z.string(), z.any()),
					}),
				),
				pagination: paginationResultSchema,
			}),
			key: ({ params, query }) => [
				"projects",
				params.organizationId,
				`${query.page}`,
				`${query.pageSize}`,
			],
		}),
	},
	"/organizations/:slugOrId/repositories": {
		GET: defineEndpoint({
			method: "GET",
			query: z.object({
				page: z.number().int().min(1).optional(),
				pageSize: z.number().int().min(1).max(100).optional(),
			}),
			params: z.object({
				slugOrId: z.string(),
			}),
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
			key: ({ params, query }) => [
				"projects",
				"organizations",
				params.slugOrId,
				`${query.page}`,
				`${query.pageSize}`,
			],
		}),
	},
} as const satisfies ApiContract;
