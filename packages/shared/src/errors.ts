import { z } from "zod";

export const ERROR_CODES = {
	BAD_REQUEST: "BAD_REQUEST",
	UNAUTHORIZED: "UNAUTHORIZED",
	FORBIDDEN: "FORBIDDEN",
	NOT_FOUND: "NOT_FOUND",
	CONFLICT: "CONFLICT",
	UNPROCESSABLE_ENTITY: "UNPROCESSABLE_ENTITY",
	TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
	INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const errorResponseSchema = z.object({
	error: z.object({
		code: z.nativeEnum(ERROR_CODES),
		message: z.string(),
	}),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
