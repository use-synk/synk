import { z } from "zod";

// -- Primitives --

const runStatusSchema = z.enum(["queued", "running", "completed", "skipped", "failed", "canceled"]);
const triggerTypeSchema = z.enum(["push", "merge", "manual"]);
const repositoryStatusSchema = z.enum(["active", "archived", "removed"]);

const paginationSchema = z.object({
	page: z.number().int(),
	pageSize: z.number().int(),
	total: z.number().int(),
	totalPages: z.number().int(),
});

// -- Repository --

const repositorySchema = z.object({
	id: z.string().uuid(),
	installationId: z.string().uuid(),
	fullName: z.string(),
	defaultBranch: z.string(),
	status: repositoryStatusSchema,
	isActive: z.boolean(),
	docsConfig: z.unknown(),
	updatedAt: z.string().datetime(),
});

const repositoryDetailSchema = repositorySchema.omit({
	fullName: true,
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
	triggerType: triggerTypeSchema,
	triggerRef: z.string(),
	triggerCommitSha: z.string(),
	docsAffected: z.boolean().nullable(),
	docPrUrl: z.string().nullable(),
	error: z.string().nullable(),
	createdAt: z.string().datetime(),
	startedAt: z.string().datetime().nullable(),
	completedAt: z.string().datetime().nullable(),
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
	repositoryId: z.string().uuid(),
	status: runStatusSchema,
	triggerType: triggerTypeSchema,
	triggerRef: z.string(),
	triggerCommitSha: z.string(),
	triggerMergeRequestNumber: z.number().int().nullable(),
	triggerMeta: z.unknown(),
	docsAffected: z.boolean().nullable(),
	docPrNumber: z.number().int().nullable(),
	docPrUrl: z.string().nullable(),
	prLink: z.string().nullable(),
	tokenUsage: z.unknown(),
	error: z.string().nullable(),
	attemptCount: z.number().int(),
	result: z.unknown(),
	aiReasoning: aiReasoningSchema,
	queuedAt: z.string().datetime(),
	startedAt: z.string().datetime().nullable(),
	completedAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

const manualRunAcceptedSchema = z.object({
	repositoryId: z.string().uuid(),
	triggerType: z.literal("manual"),
	triggerRef: z.string(),
	triggerCommitSha: z.string(),
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
