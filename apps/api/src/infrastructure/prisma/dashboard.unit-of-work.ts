import { db } from "@synk-ai/db";
import type { DashboardUnitOfWork } from "../../domain/ports/index.js";
import { createPrismaDashboardRepositories } from "./dashboard.repositories.js";

export const createPrismaDashboardUnitOfWork = (): DashboardUnitOfWork => ({
	withTransaction: async (operation) =>
		db.$transaction(async (transactionClient) =>
			operation(createPrismaDashboardRepositories(transactionClient)),
		),
});
