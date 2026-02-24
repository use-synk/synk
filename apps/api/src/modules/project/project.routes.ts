import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { ProjectServiceContract } from "../../domain/services/project-service";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import { createProjectBodySchema, listProjectsQuerySchema } from "./project.schemas";

export function createProjectRoutes({
	auth,
	projectService,
}: RouteContext & {
	projectService: ProjectServiceContract;
}) {
	const router = new Hono<AuthenticatedAppEnv>();

	router.use("*", createRequireAuthMiddleware(auth));

	router.post("/", async (ctx) => {
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
			organizationId: bodyResult.data.organizationId,
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

	router.get("/:organizationId", async (ctx) => {
		const userId = ctx.get("user").id;
		const organizationId = ctx.req.param("organizationId");

		const query = ctx.req.query();
		const queryResult = listProjectsQuerySchema.safeParse(query);
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10 } = queryResult.data;

		const result = await projectService.listProjects({
			organizationId,
			userId,
			pagination: {
				page,
				pageSize,
			},
		});

		return ctx.json({
			data: result.items.map((p) => ({
				...p,
				updatedAt: p.updatedAt.toISOString(),
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
