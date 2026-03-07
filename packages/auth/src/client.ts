"use client";

import type { BetterAuthClientOptions } from "better-auth";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { roles } from "./ac/org";

/**
 * Creates a Better Auth client with the organization plugin configured.
 *
 * **This function must be called only once per application.**
 * `createAuthClient` registers internal subscriptions and manages session state.
 * Calling this function multiple times produces independent instances that do
 * not share state, which leads to inconsistent session behaviour.
 *
 * The caller is responsible for memoizing the result, for example:
 *
 * ```ts
 * // auth-client.ts (singleton module)
 * import { createClient } from "@synk-ai/auth";
 * export const authClient = createClient();
 * ```
 */
export function createClient(options?: { baseURL?: string }) {
	const baseClientOptions = {
		plugins: [
			organizationClient({
				roles,
			}),
		],
	} satisfies BetterAuthClientOptions;

	return createAuthClient({
		...baseClientOptions,
		...(options?.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
	});
}

export type Session = ReturnType<typeof createClient>["$Infer"]["Session"];
