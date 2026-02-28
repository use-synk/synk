import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { ProjectServiceContract } from "../../domain/services/project-service";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import { createProjectBodySchema } from "./projects.schemas";

export function createProjectsRoutes({
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
