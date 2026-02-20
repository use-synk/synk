import { Hono } from "hono";
import type { AppEnv, RouteContext } from "../../types.js";

export function createHealthRoutes({ gitSha }: RouteContext) {
	const route = new Hono<AppEnv>();

	/**
	 * GET /health
	 *
	 * Returns status and version to check if the server is running and the version of the code.
	 */
	route.get("/", async (ctx) => {
		return ctx.json({ status: "ok", version: gitSha });
	});

	return route;
}
