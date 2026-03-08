import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import type { Logger } from "../logger";
import type { AppEnv } from "../types";

type LoggingOptions = {
	logger: Logger;
};

const pickClientIp = (
	forwardedForHeader: string | undefined,
	realIpHeader: string | undefined,
): string => {
	if (forwardedForHeader !== undefined) {
		const firstForwardedIp = forwardedForHeader.split(",")[0]?.trim();
		if (firstForwardedIp) {
			return firstForwardedIp;
		}
	}
	return realIpHeader ?? "unknown";
};

const toSearchParamsObject = (url: URL): Record<string, string | string[]> => {
	const params = new Map<string, string[]>();
	for (const [key, value] of url.searchParams.entries()) {
		const existing = params.get(key);
		if (existing === undefined) {
			params.set(key, [value]);
		} else {
			existing.push(value);
		}
	}

	const result: Record<string, string | string[]> = {};
	for (const [key, values] of params.entries()) {
		const singleValue = values[0];
		result[key] = values.length === 1 && singleValue !== undefined ? singleValue : values;
	}
	return result;
};

export const createLoggingMiddleware = (options: LoggingOptions): MiddlewareHandler<AppEnv> =>
	createMiddleware<AppEnv>(async (c, next) => {
		const startTime = performance.now();
		const requestId = c.get("requestId");
		const childLogger = options.logger.child({ requestId });
		const requestUrl = new URL(c.req.url);
		const request = {
			method: c.req.method,
			path: c.req.path,
			query: toSearchParamsObject(requestUrl),
			userAgent: c.req.header("user-agent") ?? "unknown",
			referer: c.req.header("referer") ?? null,
			contentLength: c.req.header("content-length") ?? null,
			clientIp: pickClientIp(c.req.header("x-forwarded-for"), c.req.header("x-real-ip")),
		};

		c.set("logger", childLogger);

		childLogger.info({ request }, "incoming request");

		try {
			await next();
		} finally {
			const status = c.res.status;
			const response = {
				status,
				contentLength: c.res.headers.get("content-length"),
			};
			const durationMs = Number((performance.now() - startTime).toFixed(2));
			const logPayload = {
				request,
				response,
				durationMs,
				dashboardUserId: c.get("dashboardAuth")?.userId ?? null,
			};

			if (status >= 500) {
				childLogger.error(logPayload, "request completed");
			} else if (status >= 400) {
				childLogger.warn(logPayload, "request completed");
			} else {
				childLogger.info(logPayload, "request completed");
			}
		}
	});
