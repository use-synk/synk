import { OpenAPIHono, createRoute, z as openApiZ } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type {
	BulkDecideProjectSuggestionsInput,
	CreateProjectSuggestionsPrInput,
	DecideProjectSuggestionInput,
	GetProjectSuggestionInput,
	GetProjectSuggestionStatsInput,
	ListProjectRunsInput,
	ListProjectSuggestionsInput,
	ProjectServiceContract,
} from "../../domain/services/project-service";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import {
	bulkDecideSuggestionsBodySchema,
	createProjectBodySchema,
	decideSuggestionBodySchema,
	listProjectRunsQuerySchema,
	listProjectSuggestionsQuerySchema,
} from "./projects.schemas";

export function createProjectsRoutes({
	auth,
	projectService,
}: RouteContext & {
	projectService: ProjectServiceContract;
}) {
	const router = new OpenAPIHono<AuthenticatedAppEnv>();

	const paginationSchema = openApiZ.object({
		page: openApiZ.number().int().min(1),
		pageSize: openApiZ.number().int().min(1),
		total: openApiZ.number().int().min(0),
		totalPages: openApiZ.number().int().min(0),
	});

	const repositorySummarySchema = openApiZ.object({
		id: openApiZ.string(),
		fullName: openApiZ.string(),
		defaultBranch: openApiZ.string(),
		isActive: openApiZ.boolean(),
	});

	const runSummarySchema = openApiZ.object({
		id: openApiZ.string(),
		status: openApiZ.string(),
		triggerType: openApiZ.string(),
		triggerRef: openApiZ.string(),
		triggerCommitSha: openApiZ.string(),
		prNumber: openApiZ.number().nullable(),
		prMessage: openApiZ.string().nullable(),
		prAuthorName: openApiZ.string().nullable(),
		prAuthorUsername: openApiZ.string().nullable(),
		prAuthorAvatarUrl: openApiZ.string().nullable(),
		sourceBranch: openApiZ.string().nullable(),
		targetBranch: openApiZ.string().nullable(),
		suggestionsDetected: openApiZ.boolean(),
		suggestionsCount: openApiZ.number().int().min(0),
		errorCode: openApiZ.string().nullable(),
		errorMessage: openApiZ.string().nullable(),
		docsAffected: openApiZ.boolean().nullable(),
		docPrUrl: openApiZ.string().nullable(),
		error: openApiZ.string().nullable(),
		createdAt: openApiZ.string(),
		startedAt: openApiZ.string().nullable(),
		completedAt: openApiZ.string().nullable(),
	});

	const suggestionStatusSchema = openApiZ.enum([
		"pending",
		"accepted",
		"declined",
		"superseded",
		"stale",
		"applied",
	]);

	const suggestionDeciderSchema = openApiZ.object({
		id: openApiZ.string(),
		name: openApiZ.string(),
		email: openApiZ.string(),
		image: openApiZ.string().nullable(),
	});

	const suggestionSummarySchema = openApiZ.object({
		id: openApiZ.string(),
		readableId: openApiZ.number().int(),
		projectId: openApiZ.string(),
		repositoryId: openApiZ.string(),
		runId: openApiZ.string(),
		docPath: openApiZ.string(),
		baseDocSha: openApiZ.string(),
		status: suggestionStatusSchema,
		title: openApiZ.string().nullable(),
		reasoning: openApiZ.string().nullable(),
		fingerprint: openApiZ.string(),
		diffAdditions: openApiZ.number().int(),
		diffDeletions: openApiZ.number().int(),
		supersedesSuggestionId: openApiZ.string().nullable(),
		decidedByUserId: openApiZ.string().nullable(),
		decidedByUser: suggestionDeciderSchema.nullable(),
		decidedAt: openApiZ.string().nullable(),
		decisionNote: openApiZ.string().nullable(),
		createdAt: openApiZ.string(),
		updatedAt: openApiZ.string(),
	});

	const suggestionDetailSchema = suggestionSummarySchema.extend({
		beforeContent: openApiZ.string().nullable(),
		proposedContent: openApiZ.string(),
		appliedInBatchId: openApiZ.string().nullable(),
	});

	const suggestionStatsSchema = openApiZ.object({
		pending: openApiZ.number().int().min(0),
		accepted: openApiZ.number().int().min(0),
	});

	const getProjectRoute = createRoute({
		method: "get",
		path: "/{projectId}",
		tags: ["projects"],
		operationId: "getProjectDetail",
		security: [{ cookieAuth: [] }],
		request: { params: openApiZ.object({ projectId: openApiZ.string() }) },
		responses: {
			200: {
				description: "Project detail",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								id: openApiZ.string(),
								name: openApiZ.string(),
								organizationId: openApiZ.string(),
								config: openApiZ.record(openApiZ.string(), openApiZ.unknown()),
								sourceRepository: repositorySummarySchema,
								docsRepository: repositorySummarySchema.nullable(),
								createdAt: openApiZ.string(),
								updatedAt: openApiZ.string(),
							}),
						}),
					},
				},
			},
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Project not found" },
		},
	});

	const listProjectRunsRoute = createRoute({
		method: "get",
		path: "/{projectId}/runs",
		tags: ["projects", "runs"],
		operationId: "listProjectRuns",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({ projectId: openApiZ.string() }),
			query: openApiZ.object({
				page: openApiZ.coerce.number().int().min(1).optional(),
				pageSize: openApiZ.coerce.number().int().min(1).max(100).optional(),
				status: openApiZ.array(openApiZ.string()).optional(),
			}),
		},
		responses: {
			200: {
				description: "Project runs",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.array(runSummarySchema),
							pagination: paginationSchema,
						}),
					},
				},
			},
			400: { description: "Bad request" },
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Project not found" },
		},
	});

	const createProjectRoute = createRoute({
		method: "post",
		path: "/",
		tags: ["projects"],
		operationId: "createProject",
		security: [{ cookieAuth: [] }],
		request: {
			body: {
				required: true,
				content: {
					"application/json": {
						schema: openApiZ.object({
							name: openApiZ.string().min(1),
							slugOrId: openApiZ.string().min(1),
							sourceRepositoryId: openApiZ.string().min(1),
							docsRepositoryId: openApiZ.string().min(1),
						}),
					},
				},
			},
		},
		responses: {
			200: {
				description: "Project created",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								id: openApiZ.string(),
								name: openApiZ.string(),
								organizationId: openApiZ.string(),
								sourceRepositoryId: openApiZ.string(),
								docsRepositoryId: openApiZ.string().nullable(),
								config: openApiZ.record(openApiZ.string(), openApiZ.unknown()),
								createdAt: openApiZ.string(),
								updatedAt: openApiZ.string(),
							}),
						}),
					},
				},
			},
			400: { description: "Bad request" },
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Organization not found" },
		},
	});

	const listProjectSuggestionsRoute = createRoute({
		method: "get",
		path: "/{projectId}/suggestions",
		tags: ["projects", "suggestions"],
		operationId: "listProjectSuggestions",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({ projectId: openApiZ.string() }),
			query: openApiZ.object({
				page: openApiZ.coerce.number().int().min(1).optional(),
				pageSize: openApiZ.coerce.number().int().min(1).max(100).optional(),
				status: openApiZ
					.union([suggestionStatusSchema, openApiZ.array(suggestionStatusSchema)])
					.optional(),
				search: openApiZ.string().max(200).optional(),
			}),
		},
		responses: {
			200: {
				description: "Project suggestions",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.array(suggestionSummarySchema),
							pagination: paginationSchema,
						}),
					},
				},
			},
			400: { description: "Bad request" },
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
		},
	});

	const getProjectSuggestionRoute = createRoute({
		method: "get",
		path: "/{projectId}/suggestions/{suggestionId}",
		tags: ["projects", "suggestions"],
		operationId: "getProjectSuggestion",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({
				projectId: openApiZ.string(),
				suggestionId: openApiZ.string(),
			}),
		},
		responses: {
			200: {
				description: "Project suggestion detail",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: suggestionDetailSchema,
						}),
					},
				},
			},
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Suggestion not found" },
		},
	});

	const getProjectSuggestionStatsRoute = createRoute({
		method: "get",
		path: "/{projectId}/suggestions/stats",
		tags: ["projects", "suggestions"],
		operationId: "getProjectSuggestionStats",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({
				projectId: openApiZ.string(),
			}),
		},
		responses: {
			200: {
				description: "Project suggestion stats",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: suggestionStatsSchema,
						}),
					},
				},
			},
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
		},
	});

	const decideProjectSuggestionRoute = createRoute({
		method: "patch",
		path: "/{projectId}/suggestions/{suggestionId}/decision",
		tags: ["projects", "suggestions"],
		operationId: "decideProjectSuggestion",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({
				projectId: openApiZ.string(),
				suggestionId: openApiZ.string(),
			}),
			body: {
				required: true,
				content: {
					"application/json": {
						schema: openApiZ.object({
							decision: openApiZ.enum(["accept", "decline", "reset"]),
							note: openApiZ.string().max(500).optional(),
						}),
					},
				},
			},
		},
		responses: {
			200: {
				description: "Updated suggestion",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: suggestionDetailSchema,
						}),
					},
				},
			},
			400: { description: "Bad request" },
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Suggestion not found" },
			409: { description: "Invalid transition" },
		},
	});

	const bulkDecideProjectSuggestionsRoute = createRoute({
		method: "post",
		path: "/{projectId}/suggestions/decisions/bulk",
		tags: ["projects", "suggestions"],
		operationId: "bulkDecideProjectSuggestions",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({
				projectId: openApiZ.string(),
			}),
			body: {
				required: true,
				content: {
					"application/json": {
						schema: openApiZ.object({
							suggestionIds: openApiZ.array(openApiZ.string().min(1)).min(1).max(200),
							decision: openApiZ.enum(["accept", "decline", "reset"]),
							note: openApiZ.string().max(500).optional(),
						}),
					},
				},
			},
		},
		responses: {
			200: {
				description: "Updated suggestions",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.array(suggestionDetailSchema),
						}),
					},
				},
			},
			400: { description: "Bad request" },
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Suggestion not found" },
			409: { description: "Invalid transition" },
		},
	});

	const createProjectSuggestionsPrRoute = createRoute({
		method: "post",
		path: "/{projectId}/suggestions/pr",
		tags: ["projects", "suggestions"],
		operationId: "createProjectSuggestionsPr",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({
				projectId: openApiZ.string(),
			}),
		},
		responses: {
			200: {
				description: "Created suggestions PR",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								batchId: openApiZ.string(),
								status: openApiZ.enum(["completed", "failed"]),
								prNumber: openApiZ.number().nullable(),
								prUrl: openApiZ.string().nullable(),
								includedSuggestionIds: openApiZ.array(openApiZ.string()),
								excluded: openApiZ.array(
									openApiZ.object({
										suggestionId: openApiZ.string(),
										docPath: openApiZ.string(),
										reason: openApiZ.enum(["file-missing", "base-sha-mismatch", "already-applied"]),
									}),
								),
							}),
						}),
					},
				},
			},
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Project not found" },
			409: { description: "No accepted suggestions" },
		},
	});

	router.use("*", createRequireAuthMiddleware(auth));

	router.openapi(getProjectRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");

		const result = await projectService.getProjectDetail({ userId, projectId });

		return ctx.json({
			data: {
				...result,
				createdAt: result.createdAt.toISOString(),
				updatedAt: result.updatedAt.toISOString(),
			},
		});
	});

	router.openapi(listProjectRunsRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");

		const query = ctx.req.query();
		const statusValues = ctx.req.queries("status") ?? [];
		const queryInput = {
			...query,
			...(statusValues.length > 0 ? { status: statusValues } : {}),
		};

		const queryResult = listProjectRunsQuerySchema.safeParse(queryInput);
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10, status } = queryResult.data;

		const listInput: ListProjectRunsInput = {
			userId,
			projectId,
			filter: {
				page,
				pageSize,
				...(status === undefined ? {} : { status }),
			},
		};

		const result = await projectService.listProjectRuns(listInput);

		return ctx.json({
			data: result.items.map((run) => ({
				id: run.id,
				status: run.status,
				triggerType: run.triggerType,
				triggerRef: run.triggerRef,
				triggerCommitSha: run.triggerCommitSha,
				prNumber: run.triggerMergeRequestNumber,
				prMessage: run.triggerPrTitle,
				prAuthorName: run.triggerPrAuthorName ?? run.triggerPrAuthorUsername,
				prAuthorUsername: run.triggerPrAuthorUsername,
				prAuthorAvatarUrl: run.triggerPrAuthorAvatarUrl,
				sourceBranch: run.triggerSourceBranch,
				targetBranch: run.triggerTargetBranch,
				suggestionsDetected: run.suggestionsCount > 0,
				suggestionsCount: run.suggestionsCount,
				errorCode: run.errorCode,
				errorMessage: run.errorMessage ?? run.error,
				docsAffected: run.docsAffected,
				docPrUrl: run.docPrUrl,
				error: run.error,
				createdAt: run.createdAt.toISOString(),
				startedAt: run.startedAt?.toISOString() ?? null,
				completedAt: run.completedAt?.toISOString() ?? null,
			})),
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	router.openapi(createProjectRoute, async (ctx) => {
		const userId = ctx.get("user").id;

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}

		const bodyResult = createProjectBodySchema.safeParse(body);
		if (!bodyResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(bodyResult.error) });
		}

		const result = await projectService.createProject({
			userId,
			slugOrId: bodyResult.data.slugOrId,
			name: bodyResult.data.name,
			sourceRepositoryId: bodyResult.data.sourceRepositoryId,
			docsRepositoryId: bodyResult.data.docsRepositoryId,
		});

		return ctx.json({
			data: {
				...result,
			},
		});
	});

	router.openapi(listProjectSuggestionsRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");
		const query = ctx.req.query();
		const statusValues = ctx.req.queries("status") ?? [];
		const queryInput = {
			...query,
			...(statusValues.length > 0 ? { status: statusValues } : {}),
		};
		const queryResult = listProjectSuggestionsQuerySchema.safeParse(queryInput);
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}
		const { page = 1, pageSize = 10, status, search } = queryResult.data;
		const listInput: ListProjectSuggestionsInput = {
			userId,
			projectId,
			filter: {
				page,
				pageSize,
				...(status === undefined ? {} : { status }),
				...(search === undefined ? {} : { search }),
			},
		};
		const result = await projectService.listProjectSuggestions(listInput);
		return ctx.json({
			data: result.items.map((item) => ({
				...item,
				decidedAt: item.decidedAt?.toISOString() ?? null,
				createdAt: item.createdAt.toISOString(),
				updatedAt: item.updatedAt.toISOString(),
			})),
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	router.openapi(getProjectSuggestionStatsRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");
		const input: GetProjectSuggestionStatsInput = {
			userId,
			projectId,
		};
		const result = await projectService.getProjectSuggestionStats(input);
		return ctx.json({
			data: result,
		});
	});

	router.openapi(getProjectSuggestionRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");
		const suggestionId = ctx.req.param("suggestionId");
		const input: GetProjectSuggestionInput = {
			userId,
			projectId,
			suggestionId,
		};
		const result = await projectService.getProjectSuggestion(input);
		return ctx.json({
			data: {
				...result,
				decidedAt: result.decidedAt?.toISOString() ?? null,
				createdAt: result.createdAt.toISOString(),
				updatedAt: result.updatedAt.toISOString(),
			},
		});
	});

	router.openapi(decideProjectSuggestionRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");
		const suggestionId = ctx.req.param("suggestionId");
		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}
		const bodyResult = decideSuggestionBodySchema.safeParse(body);
		if (!bodyResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(bodyResult.error) });
		}
		const input: DecideProjectSuggestionInput = {
			userId,
			projectId,
			suggestionId,
			decision: bodyResult.data.decision,
			note: bodyResult.data.note,
		};
		const result = await projectService.decideProjectSuggestion(input);
		return ctx.json({
			data: {
				...result,
				decidedAt: result.decidedAt?.toISOString() ?? null,
				createdAt: result.createdAt.toISOString(),
				updatedAt: result.updatedAt.toISOString(),
			},
		});
	});

	router.openapi(bulkDecideProjectSuggestionsRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");
		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}
		const bodyResult = bulkDecideSuggestionsBodySchema.safeParse(body);
		if (!bodyResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(bodyResult.error) });
		}
		const input: BulkDecideProjectSuggestionsInput = {
			userId,
			projectId,
			suggestionIds: bodyResult.data.suggestionIds,
			decision: bodyResult.data.decision,
			note: bodyResult.data.note,
		};
		const result = await projectService.bulkDecideProjectSuggestions(input);
		return ctx.json({
			data: result.map((item) => ({
				...item,
				decidedAt: item.decidedAt?.toISOString() ?? null,
				createdAt: item.createdAt.toISOString(),
				updatedAt: item.updatedAt.toISOString(),
			})),
		});
	});

	router.openapi(createProjectSuggestionsPrRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const projectId = ctx.req.param("projectId");
		const input: CreateProjectSuggestionsPrInput = {
			userId,
			projectId,
		};
		const result = await projectService.createProjectSuggestionsPr(input);
		return ctx.json({ data: result });
	});

	return router;
}
