/**
 * Error classification for BullMQ job retry decisions.
 *
 * Retryable: transient failures that may succeed on a subsequent attempt
 *   - GitHub / OpenRouter HTTP 429 (rate-limited)
 *   - Any HTTP 5xx server error
 *   - Non-HTTP errors (e.g. Redis connection drops, unknown failures)
 *
 * Non-retryable: permanent failures where retrying will not help
 *   - All HTTP 4xx client errors except 429 (e.g. 400, 401, 403, 404, 409, 410, 422)
 *   - Client errors indicate the request is invalid or the resource state is
 *     incompatible; retrying wastes budget and delays dead-letter handling.
 */

export type JobErrorClassification = "retryable" | "non-retryable";

const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_CLIENT_ERROR_MAX = 499;
const HTTP_RATE_LIMIT_STATUS = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const HTTP_SERVER_ERROR_MAX = 599;

const getHttpStatus = (error: unknown): number | null => {
	if (typeof error !== "object" || error === null) {
		return null;
	}
	const candidate = (error as Record<string, unknown>).status;
	if (typeof candidate !== "number" || !Number.isInteger(candidate)) {
		return null;
	}
	return candidate;
};

export const classifyError = (error: unknown): JobErrorClassification => {
	const status = getHttpStatus(error);

	if (status !== null) {
		if (
			status === HTTP_RATE_LIMIT_STATUS ||
			(status >= HTTP_SERVER_ERROR_MIN && status <= HTTP_SERVER_ERROR_MAX)
		) {
			return "retryable";
		}
		if (status >= HTTP_CLIENT_ERROR_MIN && status <= HTTP_CLIENT_ERROR_MAX) {
			return "non-retryable";
		}
	}

	// Default: treat unknown errors as retryable so transient failures
	// (e.g. Redis connection drops) are not silently discarded.
	return "retryable";
};
