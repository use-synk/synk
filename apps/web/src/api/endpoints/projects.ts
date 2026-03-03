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
	docsAffected: z.boolean().nullable(),
	docPrUrl: z.string().nullable(),
	error: z.string().nullable(),
	createdAt: z.string(),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
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
