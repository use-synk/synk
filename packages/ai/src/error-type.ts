export const toErrorType = (error: unknown): string =>
	error instanceof Error ? error.name : "UnknownError";
