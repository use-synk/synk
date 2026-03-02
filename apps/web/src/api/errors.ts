import type { StandardSchemaV1 } from "@/lib/types/standard-schema";
import { type ErrorResponse, errorResponseSchema } from "@synk-ai/shared";

export class ValidationError extends Error {
	readonly segment: "params" | "query" | "body" | "response";
	readonly issues: ReadonlyArray<StandardSchemaV1.Issue>;

	constructor(segment: ValidationError["segment"], issues: ReadonlyArray<StandardSchemaV1.Issue>) {
		const messages = issues
			.map((issue) => {
				const path =
					issue.path
						?.map((p) => (typeof p === "object" && "key" in p ? String(p.key) : String(p)))
						.join(".") ?? "(root)";
				return `${path}: ${issue.message}`;
			})
			.join("; ");
		super(`Invalid ${segment}: ${messages}`);
		this.name = "ValidationError";
		this.segment = segment;
		this.issues = issues;
	}
}

const tryParseApiError = (body: string): ErrorResponse["error"] | null => {
	try {
		const result = errorResponseSchema.safeParse(JSON.parse(body));
		return result.success ? result.data.error : null;
	} catch {
		return null;
	}
};

export class RequestError extends Error {
	readonly status: number;
	readonly body: string;
	readonly apiError: ErrorResponse["error"] | null;

	constructor(status: number, body: string) {
		const apiError = tryParseApiError(body);
		const displayMessage =
			apiError?.message ?? (body.length > 500 ? `${body.slice(0, 500)}…` : body);
		super(`Request failed (${status})${displayMessage ? `: ${displayMessage}` : ""}`);
		this.name = "RequestError";
		this.status = status;
		this.body = body;
		this.apiError = apiError;
	}
}

export const getErrorMessage = (
	error: unknown,
	fallback = "An unexpected error occurred",
): string => {
	if (error instanceof RequestError && error.apiError !== null) {
		const msg = error.apiError.message;
		return msg.trim() || fallback;
	}
	if (error instanceof Error) return error.message;
	return fallback;
};
