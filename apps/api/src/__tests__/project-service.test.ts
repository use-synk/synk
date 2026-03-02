import { describe, expect, it, mock } from "bun:test";
import { HTTPException } from "hono/http-exception";
import { OrganizationNotFoundError } from "../domain/errors";
import type { ProjectServiceDependencies } from "../domain/services/project-service";
import { ProjectService } from "../modules/project/project.service";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_SLUG = "acme";
const REPOSITORY_ID = "22222222-2222-4222-8222-222222222222";
const INSTALLATION_ID = "33333333-3333-4333-8333-333333333333";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const SOURCE_REPOSITORY_ID = "55555555-5555-4555-8555-555555555555";
const DOCS_REPOSITORY_ID = "66666666-6666-4666-8666-666666666666";
const PROJECT_NAME = "my-project";
const USER_ID = "user-1";
const NOW = new Date("2026-02-19T20:00:00.000Z");

const CREATED_PROJECT = {
	id: PROJECT_ID,
	name: PROJECT_NAME,
	organizationId: ORGANIZATION_ID,
	sourceRepositoryId: SOURCE_REPOSITORY_ID,
	docsRepositoryId: DOCS_REPOSITORY_ID,
	config: {},
	createdAt: NOW,
	updatedAt: NOW,
};

const REPO_LIST_ITEM = {
	id: REPOSITORY_ID,
	installationId: INSTALLATION_ID,
	fullName: "acme/docs",
	defaultBranch: "main",
	status: "active" as const,
	isActive: true,
	updatedAt: NOW,
};

const createDependencies = (): ProjectServiceDependencies => {
	const authorizationRepository: ProjectServiceDependencies["authorizationRepository"] = {
		hasInstallationAccess: mock(async () => true),
		hasRepositoryAccess: mock(async () => true),
		hasRunAccess: mock(async () => true),
		assertInstallationAccess: mock(async () => undefined),
		assertRepositoryAccess: mock(async () => undefined),
		assertRunAccess: mock(async () => undefined),
		assertOrganizationMembership: mock(async () => undefined),
	};

	const organizationRepository: ProjectServiceDependencies["organizationRepository"] = {
		findOrganizationSlug: mock(async () => ORGANIZATION_SLUG),
		findOrganizationBySlug: mock(async () => ({
			id: ORGANIZATION_ID,
			name: "Acme",
			slug: ORGANIZATION_SLUG,
			createdAt: NOW,
			updatedAt: NOW,
		})),
		getHasInstallations: mock(async () => true),
		getHasRepositories: mock(async () => true),
		getHasProjects: mock(async () => true),
		listOrganizationsForUser: mock(async () => []),
	};

	const projectRepository: ProjectServiceDependencies["projectRepository"] = {
		findProject: mock(async () => null),
		listProjects: mock(async () => ({ items: [], total: 0 })),
		listOrganizationRepositories: mock(async () => ({
			items: [REPO_LIST_ITEM],
			total: 1,
		})),
		createProject: mock(async () => {
			throw new Error("createProject should not be called");
		}),
		updateProject: mock(async () => {
			throw new Error("updateProject should not be called");
		}),
		deleteProject: mock(async () => {
			throw new Error("deleteProject should not be called");
		}),
	};

	return { authorizationRepository, organizationRepository, projectRepository };
};

describe("ProjectService.listProjects", () => {
	it("uses the UUID directly without resolving an org slug", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listProjects({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(deps.organizationRepository.findOrganizationBySlug).not.toHaveBeenCalled();
	});

	it("resolves an org slug to an organization ID before querying projects", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listProjects({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(deps.organizationRepository.findOrganizationBySlug).toHaveBeenCalledWith(
			ORGANIZATION_SLUG,
		);
		expect(deps.projectRepository.listProjects).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: ORGANIZATION_ID }),
		);
	});

	it("asserts organization membership using the resolved organization ID", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listProjects({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(deps.authorizationRepository.assertOrganizationMembership).toHaveBeenCalledWith({
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
		});
	});

	it("throws 404 when the slug does not resolve to an organization", async () => {
		const deps = createDependencies();
		deps.organizationRepository.findOrganizationBySlug = mock(async () => null);
		const service = new ProjectService(deps);

		await expect(
			service.listProjects({
				userId: USER_ID,
				slugOrId: "unknown-slug",
				pagination: { page: 1, pageSize: 10 },
			}),
		).rejects.toBeInstanceOf(OrganizationNotFoundError);

		expect(deps.projectRepository.listProjects).not.toHaveBeenCalled();
	});
});

describe("ProjectService.listOrganizationRepositories", () => {
	it("uses the UUID directly without resolving an org slug", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listOrganizationRepositories({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(deps.organizationRepository.findOrganizationBySlug).not.toHaveBeenCalled();
	});

	it("asserts organization membership using the UUID directly", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listOrganizationRepositories({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(deps.authorizationRepository.assertOrganizationMembership).toHaveBeenCalledWith({
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
		});
	});

	it("resolves an org slug to an organization ID before querying repositories", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listOrganizationRepositories({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(deps.organizationRepository.findOrganizationBySlug).toHaveBeenCalledWith(
			ORGANIZATION_SLUG,
		);
		expect(deps.projectRepository.listOrganizationRepositories).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: ORGANIZATION_ID }),
		);
	});

	it("asserts organization membership using the ID resolved from the slug", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listOrganizationRepositories({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(deps.authorizationRepository.assertOrganizationMembership).toHaveBeenCalledWith({
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
		});
	});

	it("throws 404 when the slug does not resolve to an organization", async () => {
		const deps = createDependencies();
		deps.organizationRepository.findOrganizationBySlug = mock(async () => null);
		const service = new ProjectService(deps);

		await expect(
			service.listOrganizationRepositories({
				userId: USER_ID,
				slugOrId: "unknown-slug",
				pagination: { page: 1, pageSize: 10 },
			}),
		).rejects.toBeInstanceOf(OrganizationNotFoundError);

		expect(deps.projectRepository.listOrganizationRepositories).not.toHaveBeenCalled();
	});

	it("forwards pagination to the repository unchanged", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listOrganizationRepositories({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			pagination: { page: 3, pageSize: 20 },
		});

		expect(deps.projectRepository.listOrganizationRepositories).toHaveBeenCalledWith({
			organizationId: ORGANIZATION_ID,
			pagination: { page: 3, pageSize: 20 },
		});
	});

	it("returns the paginated result from the repository", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		const result = await service.listOrganizationRepositories({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			pagination: { page: 1, pageSize: 10 },
		});

		expect(result.total).toBe(1);
		expect(result.items).toHaveLength(1);
		expect(result.items[0]?.id).toBe(REPOSITORY_ID);
	});

	it("propagates access denied errors thrown by assertOrganizationMembership", async () => {
		const deps = createDependencies();
		deps.authorizationRepository.assertOrganizationMembership = mock(async () => {
			throw new HTTPException(403, { message: "Not a member" });
		});
		const service = new ProjectService(deps);

		await expect(
			service.listOrganizationRepositories({
				userId: USER_ID,
				slugOrId: ORGANIZATION_ID,
				pagination: { page: 1, pageSize: 10 },
			}),
		).rejects.toMatchObject({ status: 403 } satisfies Pick<HTTPException, "status">);

		expect(deps.projectRepository.listOrganizationRepositories).not.toHaveBeenCalled();
	});
});

describe("ProjectService.createProject", () => {
	it("uses the UUID directly without resolving an org slug", async () => {
		const deps = createDependencies();
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await service.createProject({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			name: PROJECT_NAME,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});

		expect(deps.organizationRepository.findOrganizationBySlug).not.toHaveBeenCalled();
	});

	it("asserts organization membership using the UUID directly", async () => {
		const deps = createDependencies();
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await service.createProject({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			name: PROJECT_NAME,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});

		expect(deps.authorizationRepository.assertOrganizationMembership).toHaveBeenCalledWith({
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
		});
	});

	it("resolves an org slug to an organization ID before creating the project", async () => {
		const deps = createDependencies();
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await service.createProject({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			name: PROJECT_NAME,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});

		expect(deps.organizationRepository.findOrganizationBySlug).toHaveBeenCalledWith(
			ORGANIZATION_SLUG,
		);
		expect(deps.projectRepository.createProject).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: ORGANIZATION_ID }),
		);
	});

	it("asserts organization membership using the ID resolved from the slug", async () => {
		const deps = createDependencies();
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await service.createProject({
			userId: USER_ID,
			slugOrId: ORGANIZATION_SLUG,
			name: PROJECT_NAME,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});

		expect(deps.authorizationRepository.assertOrganizationMembership).toHaveBeenCalledWith({
			organizationId: ORGANIZATION_ID,
			userId: USER_ID,
		});
	});

	it("throws 404 when the slug does not resolve to an organization", async () => {
		const deps = createDependencies();
		deps.organizationRepository.findOrganizationBySlug = mock(async () => null);
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await expect(
			service.createProject({
				userId: USER_ID,
				slugOrId: "unknown-slug",
				name: PROJECT_NAME,
				sourceRepositoryId: SOURCE_REPOSITORY_ID,
				docsRepositoryId: DOCS_REPOSITORY_ID,
			}),
		).rejects.toBeInstanceOf(OrganizationNotFoundError);

		expect(deps.projectRepository.createProject).not.toHaveBeenCalled();
	});

	it("does not call the repository when assertOrganizationMembership throws", async () => {
		const deps = createDependencies();
		deps.authorizationRepository.assertOrganizationMembership = mock(async () => {
			throw new HTTPException(403, { message: "Not a member" });
		});
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await expect(
			service.createProject({
				userId: USER_ID,
				slugOrId: ORGANIZATION_ID,
				name: PROJECT_NAME,
				sourceRepositoryId: SOURCE_REPOSITORY_ID,
				docsRepositoryId: DOCS_REPOSITORY_ID,
			}),
		).rejects.toMatchObject({ status: 403 } satisfies Pick<HTTPException, "status">);

		expect(deps.projectRepository.createProject).not.toHaveBeenCalled();
	});

	it("calls the repository with the resolved organizationId and all project fields", async () => {
		const deps = createDependencies();
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await service.createProject({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			name: PROJECT_NAME,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});

		expect(deps.projectRepository.createProject).toHaveBeenCalledWith({
			name: PROJECT_NAME,
			organizationId: ORGANIZATION_ID,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});
	});

	it("returns the project returned by the repository", async () => {
		const deps = createDependencies();
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		const result = await service.createProject({
			userId: USER_ID,
			slugOrId: ORGANIZATION_ID,
			name: PROJECT_NAME,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
			docsRepositoryId: DOCS_REPOSITORY_ID,
		});

		expect(result).toEqual(CREATED_PROJECT);
	});

	it("propagates errors thrown by assertOrganizationMembership", async () => {
		const deps = createDependencies();
		deps.authorizationRepository.assertOrganizationMembership = mock(async () => {
			throw new HTTPException(403, { message: "Not a member" });
		});
		deps.projectRepository.createProject = mock(async () => CREATED_PROJECT);
		const service = new ProjectService(deps);

		await expect(
			service.createProject({
				userId: USER_ID,
				slugOrId: ORGANIZATION_ID,
				name: PROJECT_NAME,
				sourceRepositoryId: SOURCE_REPOSITORY_ID,
				docsRepositoryId: DOCS_REPOSITORY_ID,
			}),
		).rejects.toMatchObject({ status: 403 } satisfies Pick<HTTPException, "status">);
	});
});
