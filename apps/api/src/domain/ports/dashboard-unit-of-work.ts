import type { AuthorizationRepository } from "./authorization-repository";
import type { DashboardRepository } from "./dashboard-repository";
import type { RunRepository } from "./run-repository";

export type DashboardUnitOfWorkContext = {
	authorizationRepository: AuthorizationRepository;
	dashboardRepository: DashboardRepository;
	runRepository: RunRepository;
};

export interface DashboardUnitOfWork {
	withTransaction<T>(operation: (context: DashboardUnitOfWorkContext) => Promise<T>): Promise<T>;
}
