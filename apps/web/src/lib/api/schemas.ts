import { z } from "zod";

// -- Primitives --

const runStatusSchema = z.enum(["queued", "running", "completed", "skipped", "failed", "canceled"]);
const triggerTypeSchema = z.enum(["push", "merge", "manual"]);
const repositoryStatusSchema = z.enum(["active", "archived", "removed"]);

const paginationSchema = z.object({
	page: z.number().int(),
	page_size: z.number().int(),
	total: z.number().int(),
	total_pages: z.number().int(),
});

// -- Repository --

const repositorySchema = z.object({
	id: z.string().uuid(),
	installation_id: z.string().uuid(),
	full_name: z.string(),
	default_branch: z.string(),
	status: repositoryStatusSchema,
	is_active: z.boolean(),
	docs_config: z.unknown(),
	updated_at: z.string().datetime(),
});

const repositoryDetailSchema = repositorySchema.omit({
	full_name: true,
});

export const repositoryListResponseSchema = z.object({
	data: z.array(repositorySchema),
	pagination: paginationSchema,
});

export const repositorySingleResponseSchema = z.object({
	data: repositoryDetailSchema,
});

// -- Runs --

const runSummarySchema = z.object({
	id: z.string().uuid(),
	status: runStatusSchema,
	trigger_type: triggerTypeSchema,
	trigger_ref: z.string(),
	trigger_commit_sha: z.string(),
	docs_affected: z.boolean().nullable(),
	doc_pr_url: z.string().nullable(),
	error: z.string().nullable(),
	created_at: z.string().datetime(),
	started_at: z.string().datetime().nullable(),
	completed_at: z.string().datetime().nullable(),
});

const aiReasoningSchema = z.object({
	triage: z.string().nullable(),
	generation: z.array(
		z.object({
			path: z.string(),
			reasoning: z.string(),
		}),
	),
});

const runDetailSchema = z.object({
	id: z.string().uuid(),
	repository_id: z.string().uuid(),
	status: runStatusSchema,
	trigger_type: triggerTypeSchema,
	trigger_ref: z.string(),
	trigger_commit_sha: z.string(),
	trigger_merge_request_number: z.number().int().nullable(),
	trigger_meta: z.unknown(),
	docs_affected: z.boolean().nullable(),
	doc_pr_number: z.number().int().nullable(),
	doc_pr_url: z.string().nullable(),
	pr_link: z.string().nullable(),
	token_usage: z.unknown(),
	error: z.string().nullable(),
	attempt_count: z.number().int(),
	result: z.unknown(),
	ai_reasoning: aiReasoningSchema,
	queued_at: z.string().datetime(),
	started_at: z.string().datetime().nullable(),
	completed_at: z.string().datetime().nullable(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime(),
});

const manualRunAcceptedSchema = z.object({
	repository_id: z.string().uuid(),
	trigger_type: z.literal("manual"),
	trigger_ref: z.string(),
	trigger_commit_sha: z.string(),
	accepted: z.literal(true),
});

export const runListResponseSchema = z.object({
	data: z.array(runSummarySchema),
	pagination: paginationSchema,
});

export const runDetailResponseSchema = z.object({
	data: runDetailSchema,
});

export const manualRunAcceptedResponseSchema = z.object({
	data: manualRunAcceptedSchema,
});

// -- GitHub integration installation --

export const initiateGitHubInstallationResponseSchema = z.object({
	data: z.object({
		redirectUrl: z.string().url(),
	}),
});

export const completeGitHubInstallationResponseSchema = z.object({
	data: z.object({
		organizationSlug: z.string(),
	}),
});

// -- Inferred types --

export type RunStatus = z.infer<typeof runStatusSchema>;
export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type RepositoryStatus = z.infer<typeof repositoryStatusSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type RepositoryDetail = z.infer<typeof repositoryDetailSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type RepositoryListResponse = z.infer<typeof repositoryListResponseSchema>;
export type RepositorySingleResponse = z.infer<typeof repositorySingleResponseSchema>;
export type RunListResponse = z.infer<typeof runListResponseSchema>;
export type RunDetailResponse = z.infer<typeof runDetailResponseSchema>;
export type ManualRunAcceptedResponse = z.infer<typeof manualRunAcceptedResponseSchema>;
export type InitiateGitHubInstallationResponse = z.infer<
	typeof initiateGitHubInstallationResponseSchema
>;
export type CompleteGitHubInstallationResponse = z.infer<
	typeof completeGitHubInstallationResponseSchema
>;
