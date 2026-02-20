import { Hono } from "hono";
import type { AppEnv } from "../../types.js";
import { createAuthService } from "./auth.service.js";

export function createAuthRoutes() {
	const route = new Hono<AppEnv>();
	const { auth } = createAuthService();

	route.on(["POST", "GET"], "*", (ctx) => {
		return auth.handler(ctx.req.raw);
	});

	return route;
}
