import { env } from "@/env";
import { createApiClient } from "@/lib/api";
import { integrationsRoutes } from "./integrations";
import { repositoriesRoutes } from "./repositories";
import { runsRoutes } from "./runs";

export const client = createApiClient(
	{
		...integrationsRoutes,
		...repositoriesRoutes,
		...runsRoutes,
	},
	{
		baseURL: env.NEXT_PUBLIC_API_URL,
		defaultFetch: {
			credentials: "include",
		},
		headers: {
			"Content-Type": "application/json",
		},
	},
);
