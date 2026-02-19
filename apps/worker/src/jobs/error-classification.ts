/**
 * Error classification for BullMQ job retry decisions.
 *
 * Retryable: transient failures that may succeed on a subsequent attempt
 *   - GitHub / OpenRouter HTTP 429 (rate-limited)
 *   - Any HTTP 5xx server error
 *   - Non-HTTP errors (e.g. Redis connection drops, unknown failures)
 *
 * Non-retryable: permanent failures where retrying will not help
 *   - HTTP 401 (auth revoked)
 *   - HTTP 403 (forbidden / permissions removed)
 *   - HTTP 404 (resource permanently gone, e.g. repository deleted)
 */

export type JobErrorClassification = "retryable" | "non-retryable";

const NON_RETRYABLE_HTTP_STATUSES = new Set([401, 403, 404]);
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
		if (NON_RETRYABLE_HTTP_STATUSES.has(status)) {
			return "non-retryable";
		}
		if (
			status === HTTP_RATE_LIMIT_STATUS ||
			(status >= HTTP_SERVER_ERROR_MIN && status <= HTTP_SERVER_ERROR_MAX)
		) {
			return "retryable";
		}
	}

	// Default: treat unknown errors as retryable so transient failures
	// (e.g. Redis connection drops) are not silently discarded.
	return "retryable";
};
