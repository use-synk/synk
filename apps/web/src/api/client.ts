"use client";

import type { StandardSchemaV1 } from "@/lib/types/standard-schema";
import { useSuspenseQuery as useTanStackSuspenseQuery } from "@tanstack/react-query";
import { RequestError, ValidationError } from "./errors";
import { buildFetchUrl, parseResponseBody } from "./shared";

export const clientFetch = async <R extends StandardSchemaV1>(
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
		credentials: init.credentials ?? "include",
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

// The following functions should only be used in client components

export function useApiSuspenseQuery<R extends StandardSchemaV1>({
	url,
	init,
	key,
	response,
}: {
	url: string;
	init: RequestInit;
	key: string[];
	response: R;
}) {
	return useTanStackSuspenseQuery({
		queryKey: key,
		queryFn: async () => {
			const res = await clientFetch(url, init, response);
			return res.data;
		},
	});
}
