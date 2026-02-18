import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Logger } from "../logger";
import type { AppEnv } from "../types";

type ErrorResponse = {
	error: {
		code: string;
		message: string;
	};
};

export const createErrorHandler =
	(logger: Logger): ErrorHandler<AppEnv> =>
	(err, c) => {
		if (err instanceof HTTPException) {
			logger.warn({ status: err.status }, err.message);
			return c.json<ErrorResponse>(
				{ error: { code: "HTTP_ERROR", message: err.message } },
				err.status,
			);
		}

		logger.error({ err }, "unhandled error");
		return c.json<ErrorResponse>(
			{ error: { code: "INTERNAL_ERROR", message: "An internal error occurred" } },
			500,
		);
	};
