import { type ApiContract, defineEndpoint } from "@/lib/api";
import z from "zod";
import { paginationResultSchema } from "./schemas";

const runStatusSchema = z.enum(["queued", "running", "completed", "skipped", "failed", "canceled"]);
const triggerTypeSchema = z.enum(["push", "merge", "manual"]);

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

export const runsRoutes = {
	"/runs/repositories/:repositoryId": {
		GET: defineEndpoint({
			method: "GET",
			params: z.object({
				repositoryId: z.string(),
			}),
			query: z.object({
				page: z.number(),
				pageSize: z.number(),
				status: z.array(runStatusSchema),
			}),
			response: z.object({
				data: z.array(runSummarySchema),
				pagination: paginationResultSchema,
			}),
			key: ({ params, query }) => [
				"runs",
				"list",
				params.repositoryId,
				`${query.page}`,
				`${query.pageSize}`,
				query.status.join(","),
			],
		}),
		POST: defineEndpoint({
			method: "POST",
			params: z.object({
				repositoryId: z.string(),
			}),
			body: z.object({
				commitSha: z.string(),
				ref: z.string().nullable(),
			}),
			response: z.object({
				data: z.object({
					repositoryId: z.string().uuid(),
					triggerType: z.literal("manual"),
					triggerRef: z.string(),
					triggerCommitSha: z.string(),
					accepted: z.literal(true),
				}),
			}),
			key: ({ params }) => ["runs", "create", params.repositoryId],
		}),
	},
	"/runs/:runId": {
		GET: defineEndpoint({
			method: "GET",
			params: z.object({
				runId: z.string(),
			}),
			response: z.object({
				data: runDetailSchema,
			}),
			key: ({ params }) => ["runs", "detail", `${params.runId}`],
		}),
	},
} as const satisfies ApiContract;
