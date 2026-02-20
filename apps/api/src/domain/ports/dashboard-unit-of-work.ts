import type { AuthorizationRepository } from "./authorization-repository.js";
import type { DashboardRepository } from "./dashboard-repository.js";
import type { RunRepository } from "./run-repository.js";

export type DashboardUnitOfWorkContext = {
	authorizationRepository: AuthorizationRepository;
	dashboardRepository: DashboardRepository;
	runRepository: RunRepository;
};

export interface DashboardUnitOfWork {
	withTransaction<T>(operation: (context: DashboardUnitOfWorkContext) => Promise<T>): Promise<T>;
}
