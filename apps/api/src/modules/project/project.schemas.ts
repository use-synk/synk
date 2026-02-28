import z from "zod";

export const createProjectBodySchema = z.object({
	name: z.string().min(1),
	slugOrId: z.string().min(1),
	sourceRepositoryId: z.string().min(1),
	docsRepositoryId: z.string().min(1),
});

export const listProjectsQuerySchema = z.object({
	page: z.coerce.number().min(1).optional(),
	pageSize: z.coerce.number().min(1).max(100).optional(),
});

export const listOrganizationRepositoriesQuerySchema = z.object({
	page: z.coerce.number().min(1).optional(),
	pageSize: z.coerce.number().min(1).max(100).optional(),
});