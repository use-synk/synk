import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import type { AuthService } from "./auth.service.js";

export function createAuthRoutes({ auth }: AuthService) {
	const route = new Hono<AppEnv>();

	route.on(["POST", "GET"], "*", (ctx) => {
		return auth.handler(ctx.req.raw);
	});

	return route;
}
