import { ERROR_CODES, type ErrorCode, type ErrorResponse } from "@synk-ai/shared";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { AccessDeniedError } from "../domain/errors/access-denied-error";
import { InstallationStateError } from "../domain/errors/installation-state-error";
import { OrganizationNotFoundError } from "../domain/errors/organization-not-found-error";
import type { Logger } from "../logger";
import type { AppEnv } from "../types";

const HTTP_STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
	400: ERROR_CODES.BAD_REQUEST,
	401: ERROR_CODES.UNAUTHORIZED,
	403: ERROR_CODES.FORBIDDEN,
	404: ERROR_CODES.NOT_FOUND,
	409: ERROR_CODES.CONFLICT,
	422: ERROR_CODES.UNPROCESSABLE_ENTITY,
	429: ERROR_CODES.TOO_MANY_REQUESTS,
};

const toErrorCode = (status: number): ErrorCode => {
	const errorCode = HTTP_STATUS_TO_ERROR_CODE[status];
	if (!errorCode) {
		return ERROR_CODES.INTERNAL_ERROR;
	}
	return errorCode;
};

export const createErrorHandler =
	(logger: Logger): ErrorHandler<AppEnv> =>
	(err, c) => {
		const requestLogger = c.get("logger") ?? logger;
		const requestUrl = new URL(c.req.url);
		const request = {
			method: c.req.method,
			path: c.req.path,
			query: requestUrl.search,
			requestId: c.get("requestId"),
		};

		if (err instanceof HTTPException) {
			requestLogger.warn({ request, status: err.status }, err.message);
			return c.json<ErrorResponse>(
				{ error: { code: toErrorCode(err.status), message: err.message } },
				err.status,
			);
		}
		if (err instanceof AccessDeniedError) {
			requestLogger.warn({ request, status: 403 }, err.message);
			return c.json<ErrorResponse>(
				{ error: { code: toErrorCode(403), message: err.message } },
				403,
			);
		}
		if (err instanceof InstallationStateError) {
			requestLogger.warn({ request, status: 422 }, err.message);
			return c.json<ErrorResponse>(
				{ error: { code: toErrorCode(422), message: err.message } },
				422,
			);
		}
		if (err instanceof OrganizationNotFoundError) {
			requestLogger.warn({ request, status: 404 }, err.message);
			return c.json<ErrorResponse>(
				{ error: { code: toErrorCode(404), message: err.message } },
				404,
			);
		}

		requestLogger.error({ err, request, status: 500 }, "unhandled error");
		return c.json<ErrorResponse>(
			{ error: { code: ERROR_CODES.INTERNAL_ERROR, message: "An internal error occurred" } },
			500,
		);
	};
