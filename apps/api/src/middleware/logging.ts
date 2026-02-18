import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { Logger } from "../logger.js";
import type { AppEnv } from "../types.js";

type LoggingOptions = {
	logger: Logger;
};

export const createLoggingMiddleware = (options: LoggingOptions): MiddlewareHandler<AppEnv> =>
	createMiddleware<AppEnv>(async (c, next) => {
		const startTime = Date.now();
		const requestId = c.get("requestId");
		const childLogger = options.logger.child({ requestId });

		c.set("logger", childLogger);

		childLogger.info({ method: c.req.method, path: c.req.path }, "incoming request");

		await next();

		childLogger.info(
			{ method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - startTime },
			"request completed",
		);
	});
