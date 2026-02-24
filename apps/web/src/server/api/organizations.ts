import { type ApiContract, defineEndpoint } from "@/lib/api";
import z from "zod";

export const organizationSetupStatusResponseSchema = z.object({
	hasInstallations: z.boolean(),
	hasRepositories: z.boolean(),
	hasProjects: z.boolean(),
});

export const organizationRoutes = {
	"/dashboard/org/:slugOrId/setup": {
		GET: defineEndpoint({
			method: "GET",
			params: z.object({
				slugOrId: z.string(),
			}),
			response: z.object({
				data: organizationSetupStatusResponseSchema,
			}),
			key: ({ params }) => ["dashboard", "org", params.slugOrId, "setup"],
		}),
	},
} as const satisfies ApiContract;
