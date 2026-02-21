import z from "zod";

export const createProjectBodySchema = z.object({
	name: z.string().min(1),
	organizationId: z.string().min(1),
	sourceRepositoryId: z.string().min(1),
	docsRepositoryId: z.string().min(1),
});
