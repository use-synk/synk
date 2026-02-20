import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type { DashboardServiceContract } from "../domain/services/index.js";
import { createPrismaDashboardRepositories } from "../infrastructure/prisma/dashboard.repositories.js";
import { DashboardService } from "../modules/dashboard/dashboard.service.js";

export type AppDependencies = {
	dashboardService: DashboardServiceContract;
};

export type BuildAppDependenciesOptions = {
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
};

export const buildAppDependencies = (options: BuildAppDependenciesOptions): AppDependencies => {
	const repositories = createPrismaDashboardRepositories();
	return {
		dashboardService: new DashboardService({
			...repositories,
			enqueueAnalyzeChanges: options.enqueueAnalyzeChanges,
		}),
	};
};
