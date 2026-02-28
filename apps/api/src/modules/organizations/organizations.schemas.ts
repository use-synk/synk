import z from "zod";

export const listOrganizationRepositoriesQuerySchema = z.object({
	page: z.coerce.number().min(1).optional(),
	pageSize: z.coerce.number().min(1).max(100).optional(),
});
