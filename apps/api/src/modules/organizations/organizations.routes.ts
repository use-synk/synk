import { Hono } from "hono";
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
	const router = new Hono<AuthenticatedAppEnv>();

	router.use("*", createRequireAuthMiddleware(auth));

	router.get("/:slugOrId/setup", async (ctx) => {
		const userId = ctx.get("user").id;
		const slugOrId = ctx.req.param("slugOrId");

		const result = await dashboardService.getOrganizationSetupStatus(slugOrId, userId);

		return ctx.json({ data: result });
	});

	router.get("/:organizationId/projects", async (ctx) => {
		const userId = ctx.get("user").id;
		const organizationId = ctx.req.param("organizationId");

		const queryResult = listProjectsQuerySchema.safeParse(ctx.req.query());
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10 } = queryResult.data;

		const result = await projectService.listProjects({
			organizationId,
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

	router.get("/:slugOrId/repositories", async (ctx) => {
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
