import { createRoute, OpenAPIHono, z as openApiZ } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { DashboardServiceContract } from "../../domain/services";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import { listRepositoryRunsQuerySchema, triggerManualRunBodySchema } from "./runs.schemas";

export function createRunsRoutes({
	auth,
	dashboardService,
}: RouteContext & {
	dashboardService: DashboardServiceContract;
}) {
	const router = new OpenAPIHono<AuthenticatedAppEnv>();
	const paginationSchema = openApiZ.object({
		page: openApiZ.number().int().min(1),
		pageSize: openApiZ.number().int().min(1),
		total: openApiZ.number().int().min(0),
		totalPages: openApiZ.number().int().min(0),
	});
	const getRunRoute = createRoute({
		method: "get",
		path: "/{runId}",
		tags: ["runs"],
		operationId: "getRunDetail",
		security: [{ cookieAuth: [] }],
		request: { params: openApiZ.object({ runId: openApiZ.string() }) },
		responses: {
			200: {
				description: "Run details",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								id: openApiZ.string(),
								repositoryId: openApiZ.string(),
								status: openApiZ.string(),
								triggerType: openApiZ.string(),
								triggerRef: openApiZ.string(),
								triggerCommitSha: openApiZ.string(),
								triggerMergeRequestNumber: openApiZ.number().nullable(),
								triggerMeta: openApiZ.unknown(),
								docsAffected: openApiZ.boolean().nullable(),
								docPrNumber: openApiZ.number().nullable(),
								docPrUrl: openApiZ.string().nullable(),
								prLink: openApiZ.string().nullable(),
								tokenUsage: openApiZ.unknown(),
								error: openApiZ.string().nullable(),
								attemptCount: openApiZ.number(),
								result: openApiZ.unknown(),
								aiReasoning: openApiZ.unknown(),
								queuedAt: openApiZ.string(),
								startedAt: openApiZ.string().nullable(),
								completedAt: openApiZ.string().nullable(),
								createdAt: openApiZ.string(),
								updatedAt: openApiZ.string(),
							}),
						}),
					},
				},
			},
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Run not found" },
		},
	});
	const listRunsRoute = createRoute({
		method: "get",
		path: "/repositories/{repositoryId}",
		tags: ["runs"],
		operationId: "listRepositoryRuns",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({ repositoryId: openApiZ.string() }),
			query: openApiZ.object({
				page: openApiZ.coerce.number().int().min(1).optional(),
				pageSize: openApiZ.coerce.number().int().min(1).max(100).optional(),
				status: openApiZ.array(openApiZ.string()).optional(),
			}),
		},
		responses: {
			200: {
				description: "Repository runs",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.array(
								openApiZ.object({
									id: openApiZ.string(),
									status: openApiZ.string(),
									triggerType: openApiZ.string(),
									triggerRef: openApiZ.string(),
									triggerCommitSha: openApiZ.string(),
									docsAffected: openApiZ.boolean().nullable(),
									docPrUrl: openApiZ.string().nullable(),
									error: openApiZ.string().nullable(),
									createdAt: openApiZ.string(),
									startedAt: openApiZ.string().nullable(),
									completedAt: openApiZ.string().nullable(),
								}),
							),
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
	const triggerRunRoute = createRoute({
		method: "post",
		path: "/repositories/{repositoryId}",
		tags: ["runs"],
		operationId: "triggerRepositoryRun",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({ repositoryId: openApiZ.string() }),
			body: {
				required: true,
				content: {
					"application/json": {
						schema: openApiZ.object({
							commitSha: openApiZ.string(),
							ref: openApiZ.string().optional(),
						}),
					},
				},
			},
		},
		responses: {
			200: {
				description: "Manual run accepted",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								repositoryId: openApiZ.string(),
								triggerType: openApiZ.literal("manual"),
								triggerRef: openApiZ.string(),
								triggerCommitSha: openApiZ.string(),
								accepted: openApiZ.literal(true),
							}),
						}),
					},
				},
			},
			400: { description: "Bad request" },
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
			404: { description: "Repository not found" },
			409: { description: "Repository inactive" },
		},
	});

	router.use("*", createRequireAuthMiddleware(auth));

	router.openapi(getRunRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const runId = ctx.req.param("runId");

		const result = await dashboardService.getRunDetail(runId, userId);

		return ctx.json({
			data: {
				...result,
				queuedAt: result.queuedAt.toISOString(),
				startedAt: result.startedAt?.toISOString() ?? null,
				completedAt: result.completedAt?.toISOString() ?? null,
				createdAt: result.createdAt.toISOString(),
				updatedAt: result.updatedAt.toISOString(),
			},
		});
	});

	router.openapi(listRunsRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const repositoryId = ctx.req.param("repositoryId");

		const query = ctx.req.query();
		const statusValues = ctx.req.queries("status") ?? [];
		const queryInput = {
			...query,
			...(statusValues.length > 0 ? { status: statusValues } : {}),
		};
		const queryResult = listRepositoryRunsQuerySchema.safeParse(queryInput);
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10, status } = queryResult.data;
		const result = await dashboardService.listRepositoryRuns({
			repositoryId,
			userId,
			filter: {
				page,
				pageSize,
				...(status === undefined ? {} : { status }),
			},
		});

		return ctx.json({
			data: result.items.map((run) => ({
				...run,
				createdAt: run.createdAt.toISOString(),
			})),
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	router.openapi(triggerRunRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const repositoryId = ctx.req.param("repositoryId");

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}

		const bodyResult = triggerManualRunBodySchema.safeParse(body);
		if (!bodyResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(bodyResult.error) });
		}

		const result = await dashboardService.triggerManualRun({
			repositoryId,
			userId,
			commitSha: bodyResult.data.commitSha,
			...(bodyResult.data.ref === undefined ? {} : { ref: bodyResult.data.ref }),
		});

		return ctx.json({ data: result });
	});

	return router;
}
