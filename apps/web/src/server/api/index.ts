import { createApiClient } from "@/lib/api";
import { integrationsRoutes } from "./integrations";
import { organizationRoutes } from "./organizations";
import { projectRoutes } from "./projects";
import { repositoriesRoutes } from "./repositories";
import { runsRoutes } from "./runs";

export const api = createApiClient(
	{
		...integrationsRoutes,
		...repositoriesRoutes,
		...runsRoutes,
		...projectRoutes,
		...organizationRoutes,
	},
	{
		baseURL: "http://localhost:3030/api/v1",
		defaultFetch: {
			credentials: "include",
		},
		headers: {
			"Content-Type": "application/json",
		},
	},
);
