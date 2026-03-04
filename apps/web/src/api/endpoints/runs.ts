import { vcsProviderSchema } from "@synk-ai/shared";
import z from "zod";
import { ValidationError } from "../errors";
import { paginationResultSchema } from "../shared";
import type { ApiQuery } from "../types";

const runStatusSchema = z.enum(["queued", "running", "completed", "skipped", "failed", "canceled"]);
const triggerTypeSchema = z.enum(["push", "merge", "manual"]);

const repositorySchema = z.object({
	fullName: z.string(),
	provider: vcsProviderSchema,
});

const runSummarySchema = z.object({
	id: z.string(),
	status: runStatusSchema,
	triggerType: triggerTypeSchema,
	triggerRef: z.string(),
	triggerCommitSha: z.string(),
	docsAffected: z.boolean().nullable(),
	docPrUrl: z.string().nullable(),
	error: z.string().nullable(),
	repository: repositorySchema,
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
});

const runDetailSchema = z.object({
	id: z.string(),
	repositoryId: z.string(),
	repository: repositorySchema,
	status: runStatusSchema,
	triggerType: triggerTypeSchema,
	triggerRef: z.string(),
	triggerCommitSha: z.string(),
	triggerMergeRequestNumber: z.number().nullable(),
	triggerMeta: z.unknown(),
	docsAffected: z.boolean().nullable(),
	docPrNumber: z.number().nullable(),
	docPrUrl: z.string().nullable(),
	prLink: z.string().nullable(),
	tokenUsage: z.unknown(),
	error: z.string().nullable(),
	attemptCount: z.number(),
	result: z.unknown(),
	aiReasoning: z.unknown(),
	queuedAt: z.string(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export function getRunDetail({ runId }: { runId: string }) {
	return {
		url: `/runs/${runId}`,
		init: {
			method: "GET",
		},
		response: z.object({
			data: runDetailSchema,
		}),
		key: ["runs", "detail", runId],
	} satisfies ApiQuery;
}

const listRepositoryRunsPropsSchema = z.object({
	repositoryId: z.string().min(1),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).default(10),
	status: z.array(runStatusSchema).optional(),
});

export function listRepositoryRuns(props: z.infer<typeof listRepositoryRunsPropsSchema>) {
	const parsed = listRepositoryRunsPropsSchema.safeParse(props);
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
		url: `/runs/repositories/${parsed.data.repositoryId}?${params.toString()}`,
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.array(runSummarySchema),
			pagination: paginationResultSchema,
		}),
		key: [
			"runs",
			"list",
			parsed.data.repositoryId,
			`${parsed.data.page}`,
			`${parsed.data.pageSize}`,
			(parsed.data.status ?? []).join(","),
		],
	} satisfies ApiQuery;
}

const triggerRepositoryRunPropsSchema = z.object({
	repositoryId: z.string().min(1),
	commitSha: z.string().min(1),
	ref: z.string().optional(),
});

export function triggerRepositoryRun(props: z.infer<typeof triggerRepositoryRunPropsSchema>) {
	const parsed = triggerRepositoryRunPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const { repositoryId, ...body } = parsed.data;

	return {
		url: `/runs/repositories/${repositoryId}`,
		init: {
			method: "POST",
			body: JSON.stringify(body),
		},
		response: z.object({
			data: z.object({
				repositoryId: z.string(),
				triggerType: z.literal("manual"),
				triggerRef: z.string(),
				triggerCommitSha: z.string(),
				accepted: z.literal(true),
			}),
		}),
		key: ["runs", "create", repositoryId],
	} satisfies ApiQuery;
}
