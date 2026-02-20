import { runStatusSchema } from "@synk-ai/shared";
import z from "zod";

export const patchRepositoryBodySchema = z.object({
	isActive: z.boolean().optional(),
});

export const listInstallationRepositoriesQuerySchema = z.object({
	page: z.number().min(1).optional(),
	pageSize: z.number().min(1).max(100).optional(),
});

export const listRepositoryRunsQuerySchema = z.object({
	page: z.number().min(1).optional(),
	pageSize: z.number().min(1).max(100).optional(),
	status: z.array(runStatusSchema).optional(),
});

export const triggerManualRunBodySchema = z.object({
	commitSha: z.string().regex(/^[a-fA-F0-9]{40}$/u, "commit_sha must be a 40-char SHA"),
	ref: z.string().min(1).optional(),
});
