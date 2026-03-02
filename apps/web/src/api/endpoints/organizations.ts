import z from "zod";
import type { ApiQuery } from "../types";

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
