import z from "zod";
import { ValidationError } from "../errors";
import type { ApiQuery } from "../types";

export const createProjectBodySchema = z.object({
	name: z.string().min(1),
	slugOrId: z.string().min(1),
	sourceRepositoryId: z.string().min(1),
	docsRepositoryId: z.string().min(1),
});

export function createProject(props: z.infer<typeof createProjectBodySchema>) {
	const parsed = createProjectBodySchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	return {
		url: "/projects",
		init: {
			method: "POST",
			body: JSON.stringify(parsed.data),
		},
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
		key: ["projects", "create"],
	} satisfies ApiQuery;
}
