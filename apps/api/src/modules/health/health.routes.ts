import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv, RouteContext } from "../../types";

export function createHealthRoutes({ gitSha }: RouteContext) {
	const router = new OpenAPIHono<AppEnv>();
	const healthRoute = createRoute({
		method: "get",
		path: "/",
		tags: ["health"],
		operationId: "getHealth",
		responses: {
			200: {
				description: "Service health status",
				content: {
					"application/json": {
						schema: z.object({
							status: z.literal("ok"),
							version: z.string(),
						}),
					},
				},
			},
		},
	});

	/**
	 * GET /health
	 *
	 * Returns status and version to check if the server is running and the version of the code.
	 */
	router.openapi(healthRoute, async (ctx) => {
		return ctx.json({ status: "ok", version: gitSha });
	});

	return router;
}
