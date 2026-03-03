import type { StandardSchemaV1 } from "@/lib/types/standard-schema";
import { RequestError } from "./errors";
import { headers } from "next/headers";
import { ValidationError } from "./errors";
import { getQueryClient } from "./make-query-client";
import { buildFetchUrl, parseResponseBody } from "./shared";
import type { ApiQuery } from "./types";

export const serverFetch = async <R extends StandardSchemaV1>(
	url: string,
	init: RequestInit,
	response: R,
): Promise<{ data: StandardSchemaV1.InferOutput<R>; response: Response }> => {
	const fetchUrl = buildFetchUrl(url);

	const headers = new Headers(init.headers);

	if (!headers.has("Content-Type")) {
		headers.set("Content-Type", "application/json");
	}

	const res = await fetch(fetchUrl, {
		...init,
		headers,
	});

	if (!res.ok) {
		const errorBody = await res.text().catch(() => "");
		throw new RequestError(res.status, errorBody);
	}

	const body = await parseResponseBody(res);

	let parsed = response["~standard"].validate(body);
	if (parsed instanceof Promise) {
		parsed = await parsed;
	}

	if (parsed.issues) {
		throw new ValidationError("response", parsed.issues);
	}

	return {
		data: parsed.value,
		response: res,
	};
};

async function mergeServerAuthHeaders(initial?: HeadersInit): Promise<Headers> {
	const incoming = await headers();
	const forwarded = new Headers(initial);

	const cookie = incoming.get("cookie");
	if (cookie && !forwarded.has("cookie")) {
		forwarded.set("cookie", cookie);
	}

	const authorization = incoming.get("authorization");
	if (authorization && !forwarded.has("authorization")) {
		forwarded.set("authorization", authorization);
	}

	return forwarded;
}

// The following functions should only be used in server components

/**
 * Prefetches a query on the server and populates the shared query client cache.
 *
 * @param query - The endpoint descriptor produced by an endpoint factory function.
 * @param requestHeaders - Forwarded inbound request headers (auth, cookie).
 *   Obtain via `getApiRequestHeaders()` from `@/server/api/request-headers`.
 *   Headers already present in `query.init` are not overwritten.
 */
export async function prefetchQuery<R extends StandardSchemaV1>(query: ApiQuery<R>) {
	const client = getQueryClient();
	const headers = await mergeServerAuthHeaders(query.init.headers);

	void (await client.prefetchQuery({
		queryKey: query.key,
		queryFn: async () => {
			const res = await serverFetch(query.url, { ...query.init, headers }, query.response);
			return res.data;
		},
	}));

	return { client };
}

export async function fetchQuery<R extends StandardSchemaV1>(query: ApiQuery<R>) {
	const client = getQueryClient();
	const headers = await mergeServerAuthHeaders(query.init.headers);

	return client.fetchQuery({
		queryKey: query.key,
		queryFn: async () => {
			const res = await serverFetch(query.url, { ...query.init, headers }, query.response);
			return res.data;
		},
	});
}
