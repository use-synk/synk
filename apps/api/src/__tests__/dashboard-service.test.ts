import { describe, expect, it, mock } from "bun:test";
import { HTTPException } from "hono/http-exception";
import { DashboardService } from "../modules/dashboard/dashboard.service";
import type { DashboardServiceDependencies } from "../domain/services/dashboard-service";

const INSTALLATION_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";
const NOW = new Date("2026-02-19T20:00:00.000Z");

const createDependencies = (): DashboardServiceDependencies => {
	const authorizationRepository: DashboardServiceDependencies["authorizationRepository"] = {
		hasInstallationAccess: mock(async () => true),
		hasRepositoryAccess: mock(async () => true),
		hasRunAccess: mock(async () => true),
		assertInstallationAccess: mock(async () => undefined),
		assertRepositoryAccess: mock(async () => undefined),
		assertRunAccess: mock(async () => undefined),
	};

	const dashboardRepository: DashboardServiceDependencies["dashboardRepository"] = {
		updateRepository: mock(
			async (command: Parameters<DashboardServiceDependencies["dashboardRepository"]["updateRepository"]>[0]) =>
				({
					id: command.repositoryId,
					installationId: INSTALLATION_ID,
					fullName: "acme/docs",
					defaultBranch: "main",
					status: "active" as const,
					isActive: command.patch.isActive ?? true,
					docsConfig: {},
					createdAt: NOW,
					updatedAt: NOW,
				}),
		),
		listInstallationRepositories: mock(async () => ({ items: [], total: 0 })),
		listRepositoryRuns: mock(async () => ({ items: [], total: 0 })),
		findRepositoryForManualRun: mock(async () => ({
			status: "active" as const,
			isActive: true,
			defaultBranch: "main",
			installationId: INSTALLATION_ID,
		})),
	};

	const runRepository: DashboardServiceDependencies["runRepository"] = {
		findRunDetail: mock(async () => null),
	};

	const unitOfWork: DashboardServiceDependencies["unitOfWork"] = {
		withTransaction: mock(async (operation) =>
			operation({
				authorizationRepository,
				dashboardRepository,
				runRepository,
			}),
		),
	};

	return {
		authorizationRepository,
		dashboardRepository,
		runRepository,
		unitOfWork,
		enqueueAnalyzeChanges: mock(async () => undefined),
	};
};

describe("DashboardService", () => {
	it("patchRepository uses transaction boundary with access assertion", async () => {
		const deps = createDependencies();
		const service = new DashboardService(deps);

		await service.patchRepository({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
			isActive: false,
		});

		expect(deps.unitOfWork.withTransaction).toHaveBeenCalledOnce();
		expect(deps.authorizationRepository.assertRepositoryAccess).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
		});
		expect(deps.dashboardRepository.updateRepository).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			patch: { isActive: false },
		});
	});

	it("listRepositoryRuns uses domain filter object", async () => {
		const deps = createDependencies();
		const service = new DashboardService(deps);

		await service.listRepositoryRuns({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
			filter: {
				page: 2,
				pageSize: 25,
				status: ["running", "failed"],
			},
		});

		expect(deps.authorizationRepository.assertRepositoryAccess).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			userId: USER_ID,
		});
		expect(deps.dashboardRepository.listRepositoryRuns).toHaveBeenCalledWith({
			repositoryId: REPOSITORY_ID,
			filter: {
				page: 2,
				pageSize: 25,
				status: ["running", "failed"],
			},
		});
	});

	it("triggerManualRun rejects inactive repositories", async () => {
		const deps = createDependencies();
		deps.dashboardRepository.findRepositoryForManualRun = mock(async () => ({
			status: "removed" as const,
			isActive: false,
			defaultBranch: "main",
			installationId: INSTALLATION_ID,
		}));
		const service = new DashboardService(deps);

		await expect(
			service.triggerManualRun({
				repositoryId: REPOSITORY_ID,
				userId: USER_ID,
				commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			}),
		).rejects.toMatchObject({
			status: 409,
		} satisfies Pick<HTTPException, "status">);
	});
});
