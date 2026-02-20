import { describe, expect, it, vi } from "vitest";
import { HTTPException } from "hono/http-exception";
import { DashboardService } from "../modules/dashboard/dashboard.service.js";
import type { DashboardServiceDependencies } from "../domain/services/dashboard-service.js";

const INSTALLATION_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "user-1";
const NOW = new Date("2026-02-19T20:00:00.000Z");

const createDependencies = (): DashboardServiceDependencies => {
	const authorizationRepository: DashboardServiceDependencies["authorizationRepository"] = {
		hasInstallationAccess: vi.fn(async () => true),
		hasRepositoryAccess: vi.fn(async () => true),
		hasRunAccess: vi.fn(async () => true),
		assertInstallationAccess: vi.fn(async () => undefined),
		assertRepositoryAccess: vi.fn(async () => undefined),
		assertRunAccess: vi.fn(async () => undefined),
	};

	const dashboardRepository: DashboardServiceDependencies["dashboardRepository"] = {
		updateRepository: vi.fn(
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
		listInstallationRepositories: vi.fn(async () => ({ items: [], total: 0 })),
		listRepositoryRuns: vi.fn(async () => ({ items: [], total: 0 })),
		findRepositoryForManualRun: vi.fn(async () => ({
			status: "active" as const,
			isActive: true,
			defaultBranch: "main",
			installationId: INSTALLATION_ID,
		})),
	};

	const runRepository: DashboardServiceDependencies["runRepository"] = {
		findRunDetail: vi.fn(async () => null),
	};

	const unitOfWork: DashboardServiceDependencies["unitOfWork"] = {
		withTransaction: vi.fn(async (operation) =>
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
		enqueueAnalyzeChanges: vi.fn(async () => undefined),
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
		deps.dashboardRepository.findRepositoryForManualRun = vi.fn(async () => ({
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
