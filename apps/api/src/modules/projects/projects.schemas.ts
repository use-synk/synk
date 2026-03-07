import { runStatusSchema } from "@synk-ai/shared";
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

export const listProjectRunsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).optional(),
	pageSize: z.coerce.number().int().min(1).max(100).optional(),
	status: z.array(runStatusSchema).optional(),
});

export const suggestionDecisionSchema = z.enum(["accept", "decline", "reset"]);
const suggestionStatusSchema = z.enum([
	"pending",
	"accepted",
	"declined",
	"superseded",
	"stale",
	"applied",
]);
const suggestionStatusFilterSchema = z
	.union([suggestionStatusSchema, z.array(suggestionStatusSchema)])
	.transform((value) => (Array.isArray(value) ? value : [value]));

export const listProjectSuggestionsQuerySchema = z.object({
	page: z.coerce.number().int().min(1).optional(),
	pageSize: z.coerce.number().int().min(1).max(100).optional(),
	status: suggestionStatusFilterSchema.optional(),
	search: z.string().max(200).optional(),
});

export const decideSuggestionBodySchema = z.object({
	decision: suggestionDecisionSchema,
	note: z.string().max(500).optional(),
});

export const bulkDecideSuggestionsBodySchema = z.object({
	suggestionIds: z.array(z.string().min(1)).min(1).max(200),
	decision: suggestionDecisionSchema,
	note: z.string().max(500).optional(),
});
