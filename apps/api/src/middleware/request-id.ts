import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export const requestIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	const requestId = c.req.header("x-request-id") ?? randomUUID();
	c.set("requestId", requestId);
	c.header("x-request-id", requestId);
	await next();
});
