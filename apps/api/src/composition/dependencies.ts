import type { DashboardServiceContract } from "../domain/services/index";
import { createPrismaDashboardRepositories } from "../infrastructure/prisma/dashboard.repositories";
import { createPrismaDashboardUnitOfWork } from "../infrastructure/prisma/dashboard.unit-of-work";
import { DashboardService } from "../modules/dashboard/dashboard.service";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes";

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
