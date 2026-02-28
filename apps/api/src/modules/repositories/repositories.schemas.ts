import z from "zod";

export const patchRepositoryBodySchema = z
	.object({
		isActive: z.boolean().optional(),
	})
	.strict()
	.refine((value) => value.isActive !== undefined, {
		message: "At least one repository field must be provided",
	});

export const listInstallationRepositoriesQuerySchema = z.object({
	page: z.coerce.number().min(1).optional(),
	pageSize: z.coerce.number().min(1).max(100).optional(),
});
