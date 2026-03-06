import { runStatusSchema } from "@synk-ai/shared";
import z from "zod";
import { ValidationError } from "../errors";
import { paginationResultSchema } from "../shared";
import type { ApiQuery } from "../types";

export const createProjectBodySchema = z.object({
	name: z.string().min(1),
	slugOrId: z.string().min(1),
	sourceRepositoryId: z.string().min(1),
	docsRepositoryId: z.string().min(1),
});

const repositorySummarySchema = z.object({
	id: z.string(),
	fullName: z.string(),
	defaultBranch: z.string(),
	isActive: z.boolean(),
});

export const projectDetailSchema = z.object({
	id: z.string(),
	name: z.string(),
	organizationId: z.string(),
	config: z.record(z.string(), z.unknown()),
	sourceRepository: repositorySummarySchema,
	docsRepository: repositorySummarySchema.nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const runSummarySchema = z.object({
	id: z.string(),
	status: runStatusSchema,
	triggerType: z.enum(["push", "merge", "manual"]),
	triggerRef: z.string(),
	triggerCommitSha: z.string(),
	prNumber: z.number().nullable(),
	prMessage: z.string().nullable(),
	prAuthorName: z.string().nullable(),
	prAuthorUsername: z.string().nullable(),
	prAuthorAvatarUrl: z.string().nullable(),
	sourceBranch: z.string().nullable(),
	targetBranch: z.string().nullable(),
	suggestionsDetected: z.boolean(),
	suggestionsCount: z.number().int().min(0),
	errorCode: z.string().nullable(),
	errorMessage: z.string().nullable(),
	docsAffected: z.boolean().nullable(),
	docPrUrl: z.string().nullable(),
	error: z.string().nullable(),
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
});

const suggestionStatusSchema = z.enum([
	"pending",
	"accepted",
	"declined",
	"superseded",
	"stale",
	"applied",
]);

const suggestionDecisionSchema = z.enum(["accept", "decline", "reset"]);

const suggestionDeciderSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	image: z.string().nullable(),
});

export const suggestionSummarySchema = z.object({
	id: z.string(),
	readableId: z.number().int(),
	projectId: z.string(),
	repositoryId: z.string(),
	runId: z.string(),
	docPath: z.string(),
	baseDocSha: z.string(),
	status: suggestionStatusSchema,
	title: z.string().nullable(),
	reasoning: z.string().nullable(),
	fingerprint: z.string(),
	diffAdditions: z.number().int(),
	diffDeletions: z.number().int(),
	supersedesSuggestionId: z.string().nullable(),
	decidedByUserId: z.string().nullable(),
	decidedByUser: suggestionDeciderSchema.nullable(),
	decidedAt: z.string().nullable(),
	decisionNote: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const suggestionDetailSchema = suggestionSummarySchema.extend({
	beforeContent: z.string().nullable(),
	proposedContent: z.string(),
	appliedInBatchId: z.string().nullable(),
});

const listProjectSuggestionsPropsSchema = z.object({
	projectId: z.string().min(1),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).default(10),
	status: z.array(suggestionStatusSchema).optional(),
	search: z.string().max(200).optional(),
});

const getProjectSuggestionPropsSchema = z.object({
	projectId: z.string().min(1),
	suggestionId: z.string().min(1),
});

const decideProjectSuggestionPropsSchema = z.object({
	projectId: z.string().min(1),
	suggestionId: z.string().min(1),
	decision: suggestionDecisionSchema,
	note: z.string().max(500).optional(),
});

const bulkDecideProjectSuggestionsPropsSchema = z.object({
	projectId: z.string().min(1),
	suggestionIds: z.array(z.string().min(1)).min(1).max(200),
	decision: suggestionDecisionSchema,
	note: z.string().max(500).optional(),
});

const createProjectSuggestionsPrPropsSchema = z.object({
	projectId: z.string().min(1),
});

export function getProjectDetail({ projectId }: { projectId: string }) {
	return {
		url: `/projects/${projectId}`,
		init: { method: "GET" },
		response: z.object({ data: projectDetailSchema }),
		key: ["projects", "detail", projectId],
	} satisfies ApiQuery;
}

const listProjectRunsPropsSchema = z.object({
	projectId: z.string().min(1),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).default(10),
	status: z.array(runStatusSchema).optional(),
});

export function listProjectRuns(props: z.input<typeof listProjectRunsPropsSchema>) {
	const parsed = listProjectRunsPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const params = new URLSearchParams({
		page: parsed.data.page.toString(),
		pageSize: parsed.data.pageSize.toString(),
	});

	for (const s of parsed.data.status ?? []) {
		params.append("status", s);
	}

	return {
		url: `/projects/${parsed.data.projectId}/runs?${params.toString()}`,
		init: { method: "GET" },
		response: z.object({
			data: z.array(runSummarySchema),
			pagination: paginationResultSchema,
		}),
		key: [
			"projects",
			parsed.data.projectId,
			"runs",
			`${parsed.data.page}`,
			`${parsed.data.pageSize}`,
			(parsed.data.status ?? []).join(","),
		],
	} satisfies ApiQuery;
}

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

export function listProjectSuggestions(props: z.input<typeof listProjectSuggestionsPropsSchema>) {
	const parsed = listProjectSuggestionsPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const params = new URLSearchParams({
		page: parsed.data.page.toString(),
		pageSize: parsed.data.pageSize.toString(),
	});
	for (const status of parsed.data.status ?? []) {
		params.append("status", status);
	}
	if (parsed.data.search !== undefined && parsed.data.search.length > 0) {
		params.set("search", parsed.data.search);
	}

	return {
		url: `/projects/${parsed.data.projectId}/suggestions?${params.toString()}`,
		init: { method: "GET" },
		response: z.object({
			data: z.array(suggestionSummarySchema),
			pagination: paginationResultSchema,
		}),
		key: [
			"projects",
			parsed.data.projectId,
			"suggestions",
			`${parsed.data.page}`,
			`${parsed.data.pageSize}`,
			(parsed.data.status ?? []).join(","),
			parsed.data.search ?? "",
		],
	} satisfies ApiQuery;
}

export function getProjectSuggestion(props: z.input<typeof getProjectSuggestionPropsSchema>) {
	const parsed = getProjectSuggestionPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	return {
		url: `/projects/${parsed.data.projectId}/suggestions/${parsed.data.suggestionId}`,
		init: { method: "GET" },
		response: z.object({ data: suggestionDetailSchema }),
		key: ["projects", parsed.data.projectId, "suggestions", parsed.data.suggestionId],
	} satisfies ApiQuery;
}

export function decideProjectSuggestion(props: z.input<typeof decideProjectSuggestionPropsSchema>) {
	const parsed = decideProjectSuggestionPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	return {
		url: `/projects/${parsed.data.projectId}/suggestions/${parsed.data.suggestionId}/decision`,
		init: {
			method: "PATCH",
			body: JSON.stringify({
				decision: parsed.data.decision,
				...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
			}),
		},
		response: z.object({ data: suggestionDetailSchema }),
		key: ["projects", parsed.data.projectId, "suggestions", parsed.data.suggestionId, "decision"],
	} satisfies ApiQuery;
}

export function bulkDecideProjectSuggestions(
	props: z.input<typeof bulkDecideProjectSuggestionsPropsSchema>,
) {
	const parsed = bulkDecideProjectSuggestionsPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	return {
		url: `/projects/${parsed.data.projectId}/suggestions/decisions/bulk`,
		init: {
			method: "POST",
			body: JSON.stringify({
				suggestionIds: parsed.data.suggestionIds,
				decision: parsed.data.decision,
				...(parsed.data.note === undefined ? {} : { note: parsed.data.note }),
			}),
		},
		response: z.object({ data: z.array(suggestionDetailSchema) }),
		key: ["projects", parsed.data.projectId, "suggestions", "bulk-decision"],
	} satisfies ApiQuery;
}

export function createProjectSuggestionsPr(
	props: z.input<typeof createProjectSuggestionsPrPropsSchema>,
) {
	const parsed = createProjectSuggestionsPrPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	return {
		url: `/projects/${parsed.data.projectId}/suggestions/pr`,
		init: { method: "POST" },
		response: z.object({
			data: z.object({
				batchId: z.string(),
				status: z.enum(["completed", "failed"]),
				prNumber: z.number().nullable(),
				prUrl: z.string().nullable(),
				includedSuggestionIds: z.array(z.string()),
				excluded: z.array(
					z.object({
						suggestionId: z.string(),
						docPath: z.string(),
						reason: z.enum(["file-missing", "base-sha-mismatch", "already-applied"]),
					}),
				),
			}),
		}),
		key: ["projects", parsed.data.projectId, "suggestions", "create-pr"],
	} satisfies ApiQuery;
}
