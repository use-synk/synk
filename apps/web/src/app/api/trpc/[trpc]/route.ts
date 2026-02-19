import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
	return createTRPCContext({
		headers: req.headers,
	});
};

const handler = (req: NextRequest) => {
	const baseOptions = {
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: () => createContext(req),
	};

	if (env.NODE_ENV === "development") {
		return fetchRequestHandler({
			...baseOptions,
			onError: ({ path, error }) => {
				// biome-ignore lint/suspicious/noConsole: Need to log errors while no logger is available
				console.error(`❌ tRPC failed on ${path ?? "<no-path>"}: ${error.message}`);
			},
		});
	}

	return fetchRequestHandler(baseOptions);
};

export { handler as GET, handler as POST };
