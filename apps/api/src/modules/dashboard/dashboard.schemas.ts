import { runStatusSchema } from "@synk-ai/shared";
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

export const listRepositoryRunsQuerySchema = z.object({
	page: z.coerce.number().min(1).optional(),
	pageSize: z.coerce.number().min(1).max(100).optional(),
	status: z.array(runStatusSchema).optional(),
});

export const triggerManualRunBodySchema = z
	.object({
		commitSha: z.string().regex(/^[a-fA-F0-9]{40}$/u, "commit_sha must be a 40-char SHA"),
		ref: z.string().min(1).optional(),
	})
	.strict();
