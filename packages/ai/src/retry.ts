import { APICallError } from "ai";

export type RetryOptions = {
	maxAttempts: number;
	initialDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
	sleep: (durationMs: number) => Promise<void>;
};

export type RetryEvent = {
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	error: unknown;
};

const TRANSIENT_STATUS_CODES = new Set([429, 500, 503]);

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxAttempts: 3,
	initialDelayMs: 300,
	maxDelayMs: 2_000,
	backoffMultiplier: 2,
	sleep: async (durationMs: number): Promise<void> => {
		await new Promise<void>((resolve) => {
			setTimeout(resolve, durationMs);
		});
	},
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

export const getErrorStatusCode = (error: unknown): number | undefined => {
	if (APICallError.isInstance(error)) {
		return error.statusCode;
	}

	if (!isRecord(error)) {
		return undefined;
	}

	const statusCode = error.statusCode;
	if (typeof statusCode === "number") {
		return statusCode;
	}

	const status = error.status;
	if (typeof status === "number") {
		return status;
	}

	return undefined;
};

export const isTransientError = (error: unknown): boolean => {
	const statusCode = getErrorStatusCode(error);
	return statusCode !== undefined && TRANSIENT_STATUS_CODES.has(statusCode);
};

const assertFiniteNumber = (value: number, name: string): void => {
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be a finite number.`);
	}
};

export const validateRetryOptions = (options: RetryOptions): void => {
	assertFiniteNumber(options.maxAttempts, "maxAttempts");
	assertFiniteNumber(options.initialDelayMs, "initialDelayMs");
	assertFiniteNumber(options.maxDelayMs, "maxDelayMs");
	assertFiniteNumber(options.backoffMultiplier, "backoffMultiplier");

	if (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1) {
		throw new RangeError("maxAttempts must be an integer greater than or equal to 1.");
	}
	if (options.initialDelayMs < 0) {
		throw new RangeError("initialDelayMs must be greater than or equal to 0.");
	}
	if (options.maxDelayMs < 0) {
		throw new RangeError("maxDelayMs must be greater than or equal to 0.");
	}
	if (options.backoffMultiplier < 1) {
		throw new RangeError("backoffMultiplier must be greater than or equal to 1.");
	}
	if (options.maxDelayMs < options.initialDelayMs) {
		throw new RangeError("maxDelayMs must be greater than or equal to initialDelayMs.");
	}
};

export const withExponentialBackoff = async <TValue>(
	operation: (attempt: number) => Promise<TValue>,
	options: RetryOptions,
	onRetry: (event: RetryEvent) => void,
): Promise<TValue> => {
	validateRetryOptions(options);

	let attempt = 1;
	let delayMs = options.initialDelayMs;

	for (;;) {
		try {
			return await operation(attempt);
		} catch (error) {
			const shouldRetry = isTransientError(error) && attempt < options.maxAttempts;
			if (!shouldRetry) {
				throw error;
			}

			onRetry({
				attempt,
				maxAttempts: options.maxAttempts,
				delayMs,
				error,
			});

			await options.sleep(delayMs);
			delayMs = Math.min(Math.ceil(delayMs * options.backoffMultiplier), options.maxDelayMs);
			attempt += 1;
		}
	}
};
