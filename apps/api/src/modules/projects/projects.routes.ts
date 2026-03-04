import { OpenAPIHono, createRoute, z as openApiZ } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type {
	ListProjectRunsInput,
	ProjectServiceContract,
} from "../../domain/services/project-service";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import { createProjectBodySchema, listProjectRunsQuerySchema } from "./projects.schemas";

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

	return router;
}
