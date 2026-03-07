import { Hono } from "hono";
import type { AppEnv } from "../../types";
import type { AuthService } from "./auth.service";

export function createAuthRoutes({ auth }: AuthService) {
	const route = new Hono<AppEnv>();

	route.get("/session", async (ctx) => {
		const session = await auth.api.getSession({ headers: ctx.req.raw.headers });
		return ctx.json({ data: session });
	});

	route.on(["POST", "GET"], "*", (ctx) => {
		return auth.handler(ctx.req.raw);
	});

	return route;
}
