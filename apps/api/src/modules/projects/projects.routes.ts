import { createRoute, OpenAPIHono, z as openApiZ } from "@hono/zod-openapi";
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
	const router = new OpenAPIHono<AuthenticatedAppEnv>();
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
