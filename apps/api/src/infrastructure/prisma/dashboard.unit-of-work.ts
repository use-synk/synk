import { db } from "@synk-ai/db";
import type { DashboardUnitOfWork } from "../../domain/ports/index";
import { createPrismaDashboardRepositories } from "./dashboard.repositories";

export const createPrismaDashboardUnitOfWork = (): DashboardUnitOfWork => ({
	withTransaction: async (operation) =>
		db.$transaction(async (transactionClient) =>
			operation(createPrismaDashboardRepositories(transactionClient)),
		),
});
