import { type ApiContract, defineEndpoint } from "@/lib/api";
import z from "zod";
import { paginationResultSchema } from "./schemas";

export const repositoryStatusSchema = z.enum(["active", "archived", "removed"]);

export const repositorySchema = z.object({
	id: z.string().uuid(),
	installationId: z.string().uuid(),
	fullName: z.string(),
	defaultBranch: z.string(),
	status: repositoryStatusSchema,
	isActive: z.boolean(),
	docsConfig: z.unknown(),
	updatedAt: z.string().datetime(),
});

export const repositoriesRoutes = {
	/**
	 * GET /repositories
	 *
	 * Lists all repositories for the authenticated user.
	 */
	"/dashboard/installations/:installationId/repos": {
		GET: defineEndpoint({
			method: "GET",
			params: z.object({
				installationId: z.string(),
			}),
			query: z.object({
				page: z.number(),
				pageSize: z.number(),
			}),
			response: z.object({
				data: z.array(repositorySchema),
				pagination: paginationResultSchema,
			}),
			key: ({ params, query }) => [
				"repositories",
				"list",
				params.installationId,
				`${query.page}`,
				`${query.pageSize}`,
			],
		}),
	},
	"/dashboard/repos/:repositoryId": {
		PATCH: defineEndpoint({
			method: "PATCH",
			body: z.object({
				isActive: z.boolean().optional(),
				docsConfig: z.unknown().optional(),
			}),
			params: z.object({
				repositoryId: z.string(),
			}),
			response: z.object({
				data: repositorySchema.omit({
					fullName: true,
				}),
			}),
			key: ({ params }) => ["repositories", "detail", `${params.repositoryId}`],
		}),
	},
} as const satisfies ApiContract;
