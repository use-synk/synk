import { describe, expect, it, mock } from "bun:test";
import { HTTPException } from "hono/http-exception";
import { OrganizationNotFoundError } from "../domain/errors";
import { AccessDeniedError } from "../domain/errors/access-denied-error";
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

const PROJECT_DETAIL = {
	id: PROJECT_ID,
	name: PROJECT_NAME,
	organizationId: ORGANIZATION_ID,
	config: {} as Record<string, unknown>,
	sourceRepository: {
		id: SOURCE_REPOSITORY_ID,
		fullName: "acme/source",
		defaultBranch: "main",
		isActive: true,
	},
	docsRepository: {
		id: DOCS_REPOSITORY_ID,
		fullName: "acme/docs",
		defaultBranch: "main",
		isActive: true,
	},
	createdAt: NOW,
	updatedAt: NOW,
};

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

const SUGGESTION_DETAIL = {
	id: "suggestion-1",
	readableId: 1,
	projectId: PROJECT_ID,
	repositoryId: DOCS_REPOSITORY_ID,
	runId: "run-1",
	docPath: "docs/getting-started.md",
	baseDocSha: "abc123",
	title: null,
	beforeContent: "# Old content",
	proposedContent: "# New content",
	reasoning: "Update docs",
	fingerprint: "fp-1",
	status: "pending" as const,
	diffAdditions: 0,
	diffDeletions: 0,
	supersedesSuggestionId: null,
	decidedByUserId: null,
	decidedByUser: null,
	decidedAt: null,
	decisionNote: null,
	appliedInBatchId: null,
	createdAt: NOW,
	updatedAt: NOW,
};

const createDependencies = (): ProjectServiceDependencies => {
	const authorizationRepository: ProjectServiceDependencies["authorizationRepository"] = {
		hasInstallationAccess: mock(async () => true),
		hasRepositoryAccess: mock(async () => true),
		hasRunAccess: mock(async () => true),
		hasProjectAccess: mock(async () => true),
		assertInstallationAccess: mock(async () => undefined),
		assertRepositoryAccess: mock(async () => undefined),
		assertRunAccess: mock(async () => undefined),
		assertProjectAccess: mock(async () => undefined),
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
		findProjectWithRepositories: mock(async () => null),
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
		listProjectSuggestions: mock(async () => ({ items: [], total: 0 })),
		findProjectSuggestion: mock(async () => null),
		findProjectSuggestionsByIds: mock(async () => []),
		updateSuggestionDecision: mock(async () => SUGGESTION_DETAIL),
		updateSuggestionsDecision: mock(async () => undefined),
		findProjectSuggestionTarget: mock(async () => ({
			projectId: PROJECT_ID,
			repositoryId: DOCS_REPOSITORY_ID,
			repositoryFullName: "acme/docs",
			baseBranch: "main",
			provider: "github" as const,
			providerInstallationId: "12345",
		})),
		listAcceptedSuggestionsForPr: mock(async () => []),
		createSuggestionBatch: mock(async () => ({ id: "batch-1" })),
		completeSuggestionBatch: mock(async () => undefined),
		failSuggestionBatch: mock(async () => undefined),
		markSuggestionsApplied: mock(async () => undefined),
		markSuggestionsExcluded: mock(async () => undefined),
	};

	const dashboardRepository: ProjectServiceDependencies["dashboardRepository"] = {
		updateRepository: mock(async () => {
			throw new Error("updateRepository should not be called");
		}),
		listInstallationRepositories: mock(async () => ({ items: [], total: 0 })),
		listRepositoryRuns: mock(async () => ({ items: [], total: 0 })),
		findRepositoryForManualRun: mock(async () => null),
	};

	return {
		authorizationRepository,
		organizationRepository,
		projectRepository,
		dashboardRepository,
		githubCredentials: {
			appId: 1,
			privateKey: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
		},
	};
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

describe("ProjectService.getProjectDetail", () => {
	it("asserts project access before fetching", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProjectWithRepositories = mock(async () => PROJECT_DETAIL);
		const service = new ProjectService(deps);

		await service.getProjectDetail({ userId: USER_ID, projectId: PROJECT_ID });

		expect(deps.authorizationRepository.assertProjectAccess).toHaveBeenCalledWith({
			projectId: PROJECT_ID,
			userId: USER_ID,
		});
	});

	it("returns the project detail from the repository", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProjectWithRepositories = mock(async () => PROJECT_DETAIL);
		const service = new ProjectService(deps);

		const result = await service.getProjectDetail({ userId: USER_ID, projectId: PROJECT_ID });

		expect(result).toEqual(PROJECT_DETAIL);
	});

	it("throws 404 when the project does not exist", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProjectWithRepositories = mock(async () => null);
		const service = new ProjectService(deps);

		await expect(
			service.getProjectDetail({ userId: USER_ID, projectId: PROJECT_ID }),
		).rejects.toMatchObject({ status: 404 } satisfies Pick<HTTPException, "status">);
	});

	it("propagates access denied errors thrown by assertProjectAccess", async () => {
		const deps = createDependencies();
		deps.authorizationRepository.assertProjectAccess = mock(async () => {
			throw new AccessDeniedError("You do not have access to this project");
		});
		const service = new ProjectService(deps);

		await expect(
			service.getProjectDetail({ userId: USER_ID, projectId: PROJECT_ID }),
		).rejects.toBeInstanceOf(AccessDeniedError);

		expect(deps.projectRepository.findProjectWithRepositories).not.toHaveBeenCalled();
	});
});

describe("ProjectService.listProjectRuns", () => {
	const filter = { page: 1, pageSize: 10 };

	it("asserts project access before fetching runs", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProject = mock(async () => ({
			...CREATED_PROJECT,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
		}));
		const service = new ProjectService(deps);

		await service.listProjectRuns({ userId: USER_ID, projectId: PROJECT_ID, filter });

		expect(deps.authorizationRepository.assertProjectAccess).toHaveBeenCalledWith({
			projectId: PROJECT_ID,
			userId: USER_ID,
		});
	});

	it("lists runs using the project's sourceRepositoryId", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProject = mock(async () => ({
			...CREATED_PROJECT,
			sourceRepositoryId: SOURCE_REPOSITORY_ID,
		}));
		const service = new ProjectService(deps);

		await service.listProjectRuns({ userId: USER_ID, projectId: PROJECT_ID, filter });

		expect(deps.dashboardRepository.listRepositoryRuns).toHaveBeenCalledWith({
			repositoryId: SOURCE_REPOSITORY_ID,
			filter,
		});
	});

	it("throws 404 when the project does not exist", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProject = mock(async () => null);
		const service = new ProjectService(deps);

		await expect(
			service.listProjectRuns({ userId: USER_ID, projectId: PROJECT_ID, filter }),
		).rejects.toMatchObject({ status: 404 } satisfies Pick<HTTPException, "status">);
	});

	it("propagates access denied errors thrown by assertProjectAccess", async () => {
		const deps = createDependencies();
		deps.authorizationRepository.assertProjectAccess = mock(async () => {
			throw new AccessDeniedError("You do not have access to this project");
		});
		const service = new ProjectService(deps);

		await expect(
			service.listProjectRuns({ userId: USER_ID, projectId: PROJECT_ID, filter }),
		).rejects.toBeInstanceOf(AccessDeniedError);

		expect(deps.projectRepository.findProject).not.toHaveBeenCalled();
		expect(deps.dashboardRepository.listRepositoryRuns).not.toHaveBeenCalled();
	});
});

describe("ProjectService suggestion decisions", () => {
	it("asserts project access when listing suggestions", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await service.listProjectSuggestions({
			userId: USER_ID,
			projectId: PROJECT_ID,
			filter: { page: 1, pageSize: 10 },
		});

		expect(deps.authorizationRepository.assertProjectAccess).toHaveBeenCalledWith({
			projectId: PROJECT_ID,
			userId: USER_ID,
		});
	});

	it("returns 404 when deciding a missing suggestion", async () => {
		const deps = createDependencies();
		const service = new ProjectService(deps);

		await expect(
			service.decideProjectSuggestion({
				userId: USER_ID,
				projectId: PROJECT_ID,
				suggestionId: "missing",
				decision: "accept",
			}),
		).rejects.toMatchObject({ status: 404 } satisfies Pick<HTTPException, "status">);
	});

	it("rejects decision transitions for superseded suggestions", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProjectSuggestion = mock(async () => ({
			...SUGGESTION_DETAIL,
			status: "superseded",
		}));
		const service = new ProjectService(deps);

		await expect(
			service.decideProjectSuggestion({
				userId: USER_ID,
				projectId: PROJECT_ID,
				suggestionId: SUGGESTION_DETAIL.id,
				decision: "accept",
			}),
		).rejects.toMatchObject({ status: 409 } satisfies Pick<HTTPException, "status">);
		expect(deps.projectRepository.updateSuggestionDecision).not.toHaveBeenCalled();
	});

	it("applies bulk decisions to all matching suggestions", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProjectSuggestionsByIds = mock(async () => [SUGGESTION_DETAIL]);
		const service = new ProjectService(deps);

		const result = await service.bulkDecideProjectSuggestions({
			userId: USER_ID,
			projectId: PROJECT_ID,
			suggestionIds: [SUGGESTION_DETAIL.id],
			decision: "decline",
			note: "not needed",
		});

		expect(deps.projectRepository.updateSuggestionsDecision).toHaveBeenCalled();
		expect(result).toHaveLength(1);
	});

	it("returns 409 when creating suggestion PR without accepted suggestions", async () => {
		const deps = createDependencies();
		deps.projectRepository.listAcceptedSuggestionsForPr = mock(async () => []);
		const service = new ProjectService(deps);

		await expect(
			service.createProjectSuggestionsPr({
				userId: USER_ID,
				projectId: PROJECT_ID,
			}),
		).rejects.toMatchObject({ status: 409 } satisfies Pick<HTTPException, "status">);
	});

	it("returns 400 when creating suggestion PR for non-github repository", async () => {
		const deps = createDependencies();
		deps.projectRepository.findProjectSuggestionTarget = mock(async () => ({
			projectId: PROJECT_ID,
			repositoryId: DOCS_REPOSITORY_ID,
			repositoryFullName: "acme/docs",
			baseBranch: "main",
			provider: "gitlab",
			providerInstallationId: "12345",
		}));
		const service = new ProjectService(deps);

		await expect(
			service.createProjectSuggestionsPr({
				userId: USER_ID,
				projectId: PROJECT_ID,
			}),
		).rejects.toMatchObject({ status: 400 } satisfies Pick<HTTPException, "status">);
	});
});
