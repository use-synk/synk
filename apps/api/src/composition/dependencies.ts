import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type { DashboardServiceContract } from "../domain/services/index.js";
import { createPrismaDashboardRepositories } from "../infrastructure/prisma/dashboard.repositories.js";
import { createPrismaDashboardUnitOfWork } from "../infrastructure/prisma/dashboard.unit-of-work.js";
import { DashboardService } from "../modules/dashboard/dashboard.service.js";

export type AppDependencies = {
	dashboardService: DashboardServiceContract;
};

export type BuildAppDependenciesOptions = {
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
};

export const buildAppDependencies = (options: BuildAppDependenciesOptions): AppDependencies => {
	const repositories = createPrismaDashboardRepositories();
	const unitOfWork = createPrismaDashboardUnitOfWork();
	return {
		dashboardService: new DashboardService({
			...repositories,
			unitOfWork,
			enqueueAnalyzeChanges: options.enqueueAnalyzeChanges,
		}),
	};
};
