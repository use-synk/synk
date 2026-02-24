import { type QueryOptions, queryOptions } from "@tanstack/react-query";
import { errorResponseSchema, type ErrorResponse } from "@synk-ai/shared";
import type { StandardSchemaV1 } from "../types/standard-schema";

type OptionalSchema = StandardSchemaV1 | undefined;
type PayloadMethod = "POST" | "PUT" | "PATCH";

type SegmentArgs<Key extends string, Schema extends OptionalSchema> = undefined extends Schema
	? unknown
	: { [K in Key]: StandardSchemaV1.InferInput<NonNullable<Schema>> };

export type HTTPMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "TRACE";

export type CacheKeyFactory<
	P extends OptionalSchema,
	Q extends OptionalSchema,
	B extends OptionalSchema,
> = (args: SegmentArgs<"params", P> & SegmentArgs<"query", Q> & SegmentArgs<"body", B>) => string[];

// The body/query branch is determined by whether a body schema is provided.
// When B is undefined (no body schema), the endpoint is treated as query-style (GET/DELETE/…).
// When B is a schema, it is treated as body-style (POST/PUT/PATCH/…).
export type EndpointConfig<
	M extends HTTPMethod,
	R extends StandardSchemaV1,
	B extends OptionalSchema,
	P extends OptionalSchema,
	Q extends OptionalSchema,
> = {
	method: M;
	response: R;
	params?: P;
} & (M extends PayloadMethod
	? {
			body?: B;
			key: CacheKeyFactory<P, undefined, B>;
		}
	: {
			query?: Q;
			key: CacheKeyFactory<P, Q, undefined>;
		});

export function defineEndpoint<
	M extends HTTPMethod,
	R extends StandardSchemaV1,
	B extends OptionalSchema,
	P extends OptionalSchema,
	Q extends OptionalSchema,
>(config: EndpointConfig<M, R, B, P, Q>): EndpointConfig<M, R, B, P, Q> {
	return config;
}

/** @deprecated Use `defineEndpoint` instead. */
export const operation = defineEndpoint;

// Intentional: keep this constraint loose to preserve exact inference on each route config.
type LooseEndpointConfig<M extends HTTPMethod> = {
	method: M;
	response: StandardSchemaV1;
	params?: StandardSchemaV1 | undefined;
	// body?: StandardSchemaV1 | undefined;
	// query?: StandardSchemaV1 | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: required for representing all valid key arg signatures.
	key: (args: any) => string[];
} & (M extends PayloadMethod
	? {
			body?: StandardSchemaV1 | undefined;
		}
	: {
			query?: StandardSchemaV1 | undefined;
		});

export type ApiContract = Record<
	string,
	Partial<{
		[M in HTTPMethod]?: LooseEndpointConfig<M>;
	}>
>;

type OmitUnknownProperties<T> = {
	[K in keyof T as unknown extends T[K] ? never : K]: T[K];
};

// Internal alias that resolves the args type from a config's key function.
// Kept separate so FetchFn / KeyFn can reference it without re-exporting the alias name.
type ResolvedArgs<C> = C extends { key: (args: infer A) => unknown }
	? unknown extends A
		? Record<string, never>
		: A extends object
			? OmitUnknownProperties<A>
			: A
	: C extends { key: () => unknown }
		? Record<string, never>
		: never;

// True when the config requires no caller-supplied arguments.
type IsEmpty<A> = [A] extends [Record<string, never>] ? true : false;

export type RequestArgsFromConfig<C> = ResolvedArgs<C>;

export type ResponseDataFromConfig<C> = C extends { response: infer R extends StandardSchemaV1 }
	? StandardSchemaV1.InferOutput<R>
	: never;

type AnySchema = StandardSchemaV1<unknown, unknown>;

type RuntimeEndpoint = {
	method: HTTPMethod;
	params?: AnySchema;
	query?: AnySchema;
	body?: AnySchema;
	response: AnySchema;
	key: (args: unknown) => string[];
};

// ─── Typed errors ─────────────────────────────────────────────────────────────

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

// ─── Runtime helpers ──────────────────────────────────────────────────────────

const validateSchema = async <S extends AnySchema>(
	schema: S,
	value: unknown,
	segment: "params" | "query" | "body" | "response",
): Promise<StandardSchemaV1.InferOutput<S>> => {
	const result = await schema["~standard"].validate(value);
	if (result.issues) {
		throw new ValidationError(segment, result.issues);
	}
	return result.value as StandardSchemaV1.InferOutput<S>;
};

// When no schema is provided the raw value is passed through unchanged so that
// path parameters and query params are still forwarded without validation.
const maybeValidateSchema = async (
	schema: AnySchema | undefined,
	value: unknown,
	segment: "params" | "query" | "body",
): Promise<unknown> => {
	if (!schema) return value;
	return validateSchema(schema, value, segment);
};

const applyPathParams = (path: string, params: Record<string, unknown>): string =>
	path.replaceAll(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
		const value = params[key];
		if (value === undefined || value === null) throw new Error(`Missing path parameter: ${key}`);
		return encodeURIComponent(String(value));
	});

const appendQueryParam = (searchParams: URLSearchParams, key: string, value: unknown): void => {
	if (value === undefined || value === null) return;
	if (Array.isArray(value)) {
		for (const item of value) appendQueryParam(searchParams, key, item);
		return;
	}
	if (typeof value === "object") {
		searchParams.append(key, JSON.stringify(value));
		return;
	}
	searchParams.append(key, String(value));
};

// Dummy base used when no baseURL is configured so that URL handles query
// string building uniformly across both cases. The scheme+host are stripped
// from the return value when no real base is present.
const DUMMY_BASE = "http://localhost";

const buildRequestTarget = (
	path: string,
	baseURL: string,
	query?: Record<string, unknown>,
): RequestInfo | URL => {
	const url = new URL(`/api/v1${path}`, baseURL || DUMMY_BASE);
	if (query) {
		for (const [key, value] of Object.entries(query))
			appendQueryParam(url.searchParams, key, value);
	}
	if (!baseURL) return url.pathname + url.search;
	return url;
};

const parseJSONBody = async (response: Response): Promise<unknown> => {
	const text = await response.text();
	if (text.length === 0) return null;
	try {
		return JSON.parse(text);
	} catch {
		const contentType = response.headers.get("Content-Type") ?? "unknown";
		throw new Error(
			`Response is not valid JSON (Content-Type: ${contentType}): ${text.slice(0, 200)}`,
		);
	}
};

const withJsonContentType = (headers: HeadersInit | undefined): Headers => {
	const resolved = new Headers(headers);
	if (!resolved.has("Content-Type")) resolved.set("Content-Type", "application/json");
	return resolved;
};

export type ApiClientOptions = {
	baseURL?: string;
	fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
	defaultFetch?: RequestInit;
	headers?: HeadersInit;
};

// ─── Conditional call signatures ──────────────────────────────────────────────
// When a route requires no caller-supplied args, the args parameter is omitted
// entirely. When args are required they remain the first mandatory parameter.

type FetchFn<C> = IsEmpty<ResolvedArgs<C>> extends true
	? (options?: { signal?: AbortSignal }) => Promise<ResponseDataFromConfig<C>>
	: (
			args: RequestArgsFromConfig<C> & { signal?: AbortSignal },
		) => Promise<ResponseDataFromConfig<C>>;

type KeyFn<C> = IsEmpty<ResolvedArgs<C>> extends true
	? () => string[]
	: (args: RequestArgsFromConfig<C>) => string[];

export type OptionsFn<C> = IsEmpty<ResolvedArgs<C>> extends true
	? () => QueryOptions
	: (args: RequestArgsFromConfig<C>) => QueryOptions;

export function createApiClient<const TRoutes extends ApiContract>(
	routes: TRoutes,
	options: ApiClientOptions = {},
) {
	const baseURL = options.baseURL ?? "";
	const fetcher = options.fetcher ?? fetch;
	const defaultFetch = options.defaultFetch ?? {};
	const defaultHeaders = options.headers ?? {};

	return <
		Path extends keyof TRoutes & string,
		Method extends Extract<keyof TRoutes[Path], HTTPMethod>,
	>(
		path: Path,
		method: Method,
	) => {
		type Config = NonNullable<TRoutes[Path][Method]>;

		const endpoint = routes[path]?.[method] as RuntimeEndpoint | undefined;
		if (!endpoint) {
			throw new Error(`Missing route config for ${String(path)} ${String(method)}`);
		}

		if (endpoint.method !== method) {
			throw new Error(
				`Route method mismatch for ${String(path)} ${String(method)} (config says ${endpoint.method})`,
			);
		}

		// Runtime counterpart of the type-level IsEmpty<ResolvedArgs<Config>> check.
		// True when no schemas are present, meaning no args are required from the caller.
		const hasArgs = !!(endpoint.params || endpoint.query || endpoint.body);

		const $fetchCore = async (
			raw: Record<string, unknown>,
			signal: AbortSignal | undefined,
			headers?: HeadersInit,
		): Promise<ResponseDataFromConfig<Config>> => {
			const normalizedHeaders = new Headers(headers);
			for (const [key, value] of Object.entries(defaultHeaders)) {
				if (!normalizedHeaders.has(key)) {
					normalizedHeaders.set(key, value);
				}
			}

			const [validatedParams, validatedQuery, validatedBody] = await Promise.all([
				maybeValidateSchema(endpoint.params, raw.params, "params"),
				maybeValidateSchema(endpoint.query, raw.query, "query"),
				maybeValidateSchema(endpoint.body, raw.body, "body"),
			]);

			const resolvedPath =
				validatedParams && typeof validatedParams === "object"
					? applyPathParams(path, validatedParams as Record<string, unknown>)
					: path;

			const target =
				validatedQuery && typeof validatedQuery === "object"
					? buildRequestTarget(resolvedPath, baseURL, validatedQuery as Record<string, unknown>)
					: buildRequestTarget(resolvedPath, baseURL);

			const init: RequestInit = {
				...defaultFetch,
				method,
				headers: normalizedHeaders,
				signal,
			};

			if (validatedBody !== undefined) {
				init.body = JSON.stringify(validatedBody);
				init.headers = withJsonContentType(init.headers);
			}

			const response = await fetcher(target, init);
			if (!response.ok) {
				const errorBody = await response.text().catch(() => "");
				throw new RequestError(response.status, errorBody);
			}

			const responseJSON = await parseJSONBody(response);
			return validateSchema(endpoint.response, responseJSON, "response") as Promise<
				ResponseDataFromConfig<Config>
			>;
		};

		const $fetch: FetchFn<Config> = (
			hasArgs
				? (args: RequestArgsFromConfig<Config> & {
						signal?: AbortSignal;
						headers?: HeadersInit;
					}) => {
						const { signal, headers, ...rawArgs } = args as Record<string, unknown> & {
							signal?: AbortSignal;
							headers?: HeadersInit;
						};
						return $fetchCore(rawArgs as Record<string, unknown>, signal, headers);
					}
				: (opts?: { signal?: AbortSignal; headers?: HeadersInit }) =>
						$fetchCore({}, opts?.signal, opts?.headers)
		) as FetchFn<Config>;

		const keyFn: KeyFn<Config> = (
			hasArgs
				? (args: RequestArgsFromConfig<Config>) => endpoint.key(args as unknown)
				: () => endpoint.key({})
		) as KeyFn<Config>;

		const options = hasArgs
			? (args: RequestArgsFromConfig<Config> & { headers?: HeadersInit }) => {
					return queryOptions({
						queryKey: keyFn(args),
						queryFn: () => $fetch(args),
					});
				}
			: (args?: {
					headers?: HeadersInit;
				}) => {
					return queryOptions({
						queryKey: keyFn({} as RequestArgsFromConfig<Config>),
						queryFn: () =>
							$fetch({ headers: args?.headers } as unknown as RequestArgsFromConfig<Config>),
					});
				};

		return { $fetch, keyFn, options };
	};
}

/** @deprecated Use `createApiClient` instead. */
export const api = createApiClient;
