import { type ApiContract, defineEndpoint } from "@/lib/api";
import z from "zod";
import { paginationResultSchema } from "./schemas";

export const projectRoutes = {
	"/project/:organizationId": {
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
} as const satisfies ApiContract;
