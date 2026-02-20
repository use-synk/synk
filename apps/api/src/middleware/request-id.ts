import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolveRequestId = (header: string | undefined): string => {
	if (header !== undefined && UUID_PATTERN.test(header)) {
		return header;
	}
	return randomUUID();
};

export const requestIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
	const requestId = resolveRequestId(c.req.header("x-request-id"));
	c.set("requestId", requestId);
	c.header("x-request-id", requestId);
	await next();
});
