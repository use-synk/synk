import { createRoute, OpenAPIHono, z as openApiZ } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { DashboardServiceContract } from "../../domain/services";
import type { ProjectServiceContract } from "../../domain/services/project-service";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import { listProjectsQuerySchema } from "../projects/projects.schemas";
import { listOrganizationRepositoriesQuerySchema } from "./organizations.schemas";

export function createOrganizationsRoutes({
	auth,
	dashboardService,
	projectService,
}: RouteContext & {
	dashboardService: DashboardServiceContract;
	projectService: ProjectServiceContract;
}) {
	const router = new OpenAPIHono<AuthenticatedAppEnv>();
	const paginationSchema = openApiZ.object({
		page: openApiZ.number().int().min(1),
		pageSize: openApiZ.number().int().min(1),
		total: openApiZ.number().int().min(0),
		totalPages: openApiZ.number().int().min(0),
	});
	const setupRoute = createRoute({
		method: "get",
		path: "/{slugOrId}/setup",
		tags: ["organizations"],
		operationId: "getOrganizationSetupStatus",
		security: [{ cookieAuth: [] }],
		request: { params: openApiZ.object({ slugOrId: openApiZ.string() }) },
		responses: {
			200: {
				description: "Organization setup status",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								hasInstallations: openApiZ.boolean(),
								hasRepositories: openApiZ.boolean(),
								hasProjects: openApiZ.boolean(),
							}),
						}),
					},
				},
			},
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
		},
	});
	const listProjectsRoute = createRoute({
		method: "get",
		path: "/{slugOrId}/projects",
		tags: ["organizations", "projects"],
		operationId: "listOrganizationProjects",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({ slugOrId: openApiZ.string() }),
			query: openApiZ.object({
				page: openApiZ.coerce.number().int().min(1).optional(),
				pageSize: openApiZ.coerce.number().int().min(1).max(100).optional(),
			}),
		},
		responses: {
			200: {
				description: "Organization projects",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.array(
								openApiZ.object({
									id: openApiZ.string(),
									name: openApiZ.string(),
									organizationId: openApiZ.string(),
									sourceRepositoryId: openApiZ.string(),
									docsRepositoryId: openApiZ.string().nullable(),
									config: openApiZ.record(openApiZ.string(), openApiZ.unknown()),
									createdAt: openApiZ.string(),
									updatedAt: openApiZ.string(),
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
	const listRepositoriesRoute = createRoute({
		method: "get",
		path: "/{slugOrId}/repositories",
		tags: ["organizations", "repositories"],
		operationId: "listOrganizationRepositories",
		security: [{ cookieAuth: [] }],
		request: {
			params: openApiZ.object({ slugOrId: openApiZ.string() }),
			query: openApiZ.object({
				page: openApiZ.coerce.number().int().min(1).optional(),
				pageSize: openApiZ.coerce.number().int().min(1).max(100).optional(),
			}),
		},
		responses: {
			200: {
				description: "Organization repositories",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.array(
								openApiZ.object({
									id: openApiZ.string(),
									installationId: openApiZ.string(),
									fullName: openApiZ.string(),
									defaultBranch: openApiZ.string(),
									status: openApiZ.string(),
									isActive: openApiZ.boolean(),
									updatedAt: openApiZ.string(),
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
			404: { description: "Organization not found" },
		},
	});

	router.use("*", createRequireAuthMiddleware(auth));

	router.openapi(setupRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const slugOrId = ctx.req.param("slugOrId");

		const result = await dashboardService.getOrganizationSetupStatus(slugOrId, userId);

		return ctx.json({ data: result });
	});

	router.openapi(listProjectsRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const slugOrId = ctx.req.param("slugOrId");

		const queryResult = listProjectsQuerySchema.safeParse(ctx.req.query());
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10 } = queryResult.data;

		const result = await projectService.listProjects({
			slugOrId,
			userId,
			pagination: { page, pageSize },
		});

		return ctx.json({
			data: result.items.map((project) => ({
				...project,
				updatedAt: project.updatedAt.toISOString(),
			})),
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	router.openapi(listRepositoriesRoute, async (ctx) => {
		const userId = ctx.get("user").id;
		const slugOrId = ctx.req.param("slugOrId");

		const queryResult = listOrganizationRepositoriesQuerySchema.safeParse(ctx.req.query());
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10 } = queryResult.data;

		const result = await projectService.listOrganizationRepositories({
			userId,
			slugOrId,
			pagination: { page, pageSize },
		});

		return ctx.json({
			data: result.items.map((repository) => ({
				...repository,
				updatedAt: repository.updatedAt.toISOString(),
			})),
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	return router;
}
