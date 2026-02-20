import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { AccessDeniedError } from "../domain/errors/access-denied-error";
import type { Logger } from "../logger";
import type { AppEnv } from "../types";

type ErrorResponse = {
	error: {
		code: string;
		message: string;
	};
};

const HTTP_ERROR_CODES: Partial<Record<number, string>> = {
	400: "BAD_REQUEST",
	401: "UNAUTHORIZED",
	403: "FORBIDDEN",
	404: "NOT_FOUND",
	409: "CONFLICT",
	422: "UNPROCESSABLE_ENTITY",
	429: "TOO_MANY_REQUESTS",
};

const toErrorCode = (status: number): string => HTTP_ERROR_CODES[status] ?? `HTTP_${status}`;

export const createErrorHandler =
	(logger: Logger): ErrorHandler<AppEnv> =>
	(err, c) => {
		if (err instanceof HTTPException) {
			logger.warn({ status: err.status }, err.message);
			return c.json<ErrorResponse>(
				{ error: { code: toErrorCode(err.status), message: err.message } },
				err.status,
			);
		}
		if (err instanceof AccessDeniedError) {
			logger.warn({ status: 403 }, err.message);
			return c.json<ErrorResponse>(
				{ error: { code: toErrorCode(403), message: err.message } },
				403,
			);
		}

		logger.error({ err }, "unhandled error");
		return c.json<ErrorResponse>(
			{ error: { code: "INTERNAL_ERROR", message: "An internal error occurred" } },
			500,
		);
	};
