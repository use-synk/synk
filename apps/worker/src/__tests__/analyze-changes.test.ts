import type { Job } from "bullmq";
import type { Logger } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — vi.mock is hoisted to the top by vitest's transform, so any
// variables used inside factory functions must themselves be hoisted with
// vi.hoisted() to be accessible before the mock factories run.
// ---------------------------------------------------------------------------

const {
	mockFindUniqueRepository,
	mockUpdateProviderRepository,
	mockCreateAnalysisRun,
	mockUpdateAnalysisRun,
	mockParseGitHubCredentialsEnvironment,
	mockCredentialsFromEnvironment,
	mockCreateInstallationOctokit,
	mockFetchPushDiff,
	mockFetchPRDiff,
	mockFilterDiff,
	mockFetchFileContent,
	mockFetchRepoTree,
	mockFetchMultipleFiles,
	mockDetectAdapter,
	mockGetAdapter,
} = vi.hoisted(() => ({
	mockFindUniqueRepository: vi.fn(),
	mockUpdateProviderRepository: vi.fn().mockResolvedValue({}),
	mockCreateAnalysisRun: vi.fn(),
	mockUpdateAnalysisRun: vi.fn(),
	mockParseGitHubCredentialsEnvironment: vi.fn(),
	mockCredentialsFromEnvironment: vi.fn(),
	mockCreateInstallationOctokit: vi.fn(),
	mockFetchPushDiff: vi.fn(),
	mockFetchPRDiff: vi.fn(),
	mockFilterDiff: vi.fn(),
	mockFetchFileContent: vi.fn(),
	mockFetchRepoTree: vi.fn(),
	mockFetchMultipleFiles: vi.fn(),
	mockDetectAdapter: vi.fn(),
	mockGetAdapter: vi.fn(),
}));

vi.mock("@synk-ai/db", () => ({
	db: {
		providerRepository: {
			findUnique: mockFindUniqueRepository,
			update: mockUpdateProviderRepository,
		},
		analysisRun: {
			create: mockCreateAnalysisRun,
			update: mockUpdateAnalysisRun,
		},
	},
}));

vi.mock("@synk-ai/github", () => ({
	parseGitHubCredentialsEnvironment: mockParseGitHubCredentialsEnvironment,
	credentialsFromEnvironment: mockCredentialsFromEnvironment,
	createInstallationOctokit: mockCreateInstallationOctokit,
	fetchPushDiff: mockFetchPushDiff,
	fetchPRDiff: mockFetchPRDiff,
	filterDiff: mockFilterDiff,
	fetchFileContent: mockFetchFileContent,
	fetchRepoTree: mockFetchRepoTree,
	fetchMultipleFiles: mockFetchMultipleFiles,
}));

vi.mock("@synk-ai/doc-adapters", () => ({
	detectAdapter: mockDetectAdapter,
	getAdapter: mockGetAdapter,
}));

// ---------------------------------------------------------------------------
// Imports under test (after vi.mock so they receive the mocked modules)
// ---------------------------------------------------------------------------

import type { AnalyzeChangesJobPayload } from "@synk-ai/shared";
import {
	aggregateTokenUsage,
	mergeResolvedConfig,
	normalizeTokenUsage,
	parseDocsConfigFromObject,
	parseFramework,
	parseInstallationId,
	parseOwnerAndRepo,
	parseSynkAiYaml,
	processAnalyzeChangesJob,
} from "../jobs/analyze-changes.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// makeLogger creates a minimal mock of the pino Logger. Only the methods used
// by processAnalyzeChangesJob are provided; the rest are cast away.
const makeLogger = (): Logger =>
	({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child: vi.fn().mockReturnThis(),
	}) as unknown as Logger;

// makeJob creates a minimal mock of the BullMQ Job object. Only the fields
// accessed by processAnalyzeChangesJob are provided; the rest are cast away.
const makeJob = (
	overrides: Partial<{
		id: string;
		attemptsMade: number;
		queueName: string;
		trigger: AnalyzeChangesJobPayload["trigger"];
		repositoryId: string;
		installationId: string;
	}> = {},
): Job<AnalyzeChangesJobPayload> =>
	({
		id: overrides.id ?? "job-1",
		attemptsMade: overrides.attemptsMade ?? 0,
		queueName: overrides.queueName ?? "analyze-changes",
		data: {
			repositoryId: overrides.repositoryId ?? "repo-1",
			installationId: overrides.installationId ?? "install-1",
			trigger: overrides.trigger ?? {
				type: "push" as const,
				ref: "refs/heads/main",
				commitSha: "abc123",
			},
		},
	}) as unknown as Job<AnalyzeChangesJobPayload>;

const makeRepository = (overrides: Partial<{ provider: string }> = {}) => ({
	id: "repo-1",
	provider: overrides.provider ?? "github",
	fullName: "acme/app",
	defaultBranch: "main",
	docsConfig: null,
	installation: {
		id: "install-1",
		provider: "github",
		providerInstallationId: "99999",
		status: "active",
	},
});

const makeAdapter = () => ({
	frameworkId: "nextra",
	getDocPaths: vi.fn().mockReturnValue([]),
	parseStructure: vi.fn().mockReturnValue({}),
});

const notFoundError = () => Object.assign(new Error("Not Found"), { status: 404 });

// ---------------------------------------------------------------------------
// parseOwnerAndRepo
// ---------------------------------------------------------------------------

describe("parseOwnerAndRepo", () => {
	it("returns owner and repo from valid fullName", () => {
		expect(parseOwnerAndRepo("acme/app")).toEqual({ owner: "acme", repo: "app" });
	});

	it("throws when fullName has no slash", () => {
		expect(() => parseOwnerAndRepo("invalid")).toThrow("Expected owner/repo");
	});

	it("throws when owner is empty", () => {
		expect(() => parseOwnerAndRepo("/repo")).toThrow("Expected owner/repo");
	});

	it("throws when repo is empty", () => {
		expect(() => parseOwnerAndRepo("owner/")).toThrow("Expected owner/repo");
	});
});

// ---------------------------------------------------------------------------
// parseInstallationId
// ---------------------------------------------------------------------------

describe("parseInstallationId", () => {
	it("parses a valid positive integer string", () => {
		expect(parseInstallationId("12345")).toBe(12345);
	});

	it("throws for a non-numeric string", () => {
		expect(() => parseInstallationId("abc")).toThrow("Expected positive integer");
	});

	it("throws for zero", () => {
		expect(() => parseInstallationId("0")).toThrow("Expected positive integer");
	});

	it("throws for a negative number", () => {
		expect(() => parseInstallationId("-1")).toThrow("Expected positive integer");
	});

	it("truncates decimal strings (parseInt behaviour)", () => {
		// parseInt("1.5") === 1, which is a valid positive integer.
		expect(parseInstallationId("1.5")).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// parseFramework
// ---------------------------------------------------------------------------

describe("parseFramework", () => {
	it.each(["auto", "nextra", "fumadocs", "docusaurus", "markdown"] as const)(
		"returns '%s' for valid framework value",
		(framework) => {
			expect(parseFramework(framework)).toBe(framework);
		},
	);

	it("returns undefined for an unknown value", () => {
		expect(parseFramework("gatsby")).toBeUndefined();
	});

	it("returns undefined for undefined input", () => {
		expect(parseFramework(undefined)).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// normalizeTokenUsage
// ---------------------------------------------------------------------------

describe("normalizeTokenUsage", () => {
	it("returns zeros when input is undefined", () => {
		expect(normalizeTokenUsage(undefined)).toEqual({ prompt: 0, completion: 0, total: 0 });
	});

	it("fills missing fields with 0 and derives total", () => {
		expect(normalizeTokenUsage({ prompt: 10 })).toEqual({ prompt: 10, completion: 0, total: 10 });
	});

	it("preserves an explicit total over the derived value", () => {
		expect(normalizeTokenUsage({ prompt: 10, completion: 5, total: 20 })).toEqual({
			prompt: 10,
			completion: 5,
			total: 20,
		});
	});
});

// ---------------------------------------------------------------------------
// aggregateTokenUsage
// ---------------------------------------------------------------------------

describe("aggregateTokenUsage", () => {
	it("returns all zeros when inputs are zero", () => {
		const result = aggregateTokenUsage({ prompt: 0, completion: 0, total: 0 }, []);
		expect(result.total).toEqual({ prompt: 0, completion: 0, total: 0 });
	});

	it("sums triage and generation usage correctly", () => {
		const result = aggregateTokenUsage({ prompt: 10, completion: 5, total: 15 }, [
			{ prompt: 20, completion: 10, total: 30 },
			{ prompt: 5, completion: 5, total: 10 },
		]);
		expect(result.triage).toEqual({ prompt: 10, completion: 5, total: 15 });
		expect(result.generation).toEqual({ prompt: 25, completion: 15, total: 40 });
		expect(result.total).toEqual({ prompt: 35, completion: 20, total: 55 });
	});
});

// ---------------------------------------------------------------------------
// parseSynkAiYaml
// ---------------------------------------------------------------------------

describe("parseSynkAiYaml", () => {
	it("returns empty config for empty content", () => {
		expect(parseSynkAiYaml("")).toEqual({ docs: {}, ignorePaths: [] });
	});

	it("parses docs section fields", () => {
		const yaml = `
docs:
  framework: nextra
  path: /docs
  repo: acme/docs
  branch: main
`;
		expect(parseSynkAiYaml(yaml)?.docs).toEqual({
			framework: "nextra",
			path: "/docs",
			repo: "acme/docs",
			branch: "main",
		});
	});

	it("parses triggers.ignore_paths", () => {
		const yaml = `
triggers:
  ignore_paths:
    - "*.test.ts"
    - dist/**
`;
		expect(parseSynkAiYaml(yaml)?.ignorePaths).toEqual(["*.test.ts", "dist/**"]);
	});

	it("ignores unknown framework values", () => {
		const yaml = `
docs:
  framework: gatsby
`;
		expect(parseSynkAiYaml(yaml)?.docs.framework).toBeUndefined();
	});

	it("ignores comment lines", () => {
		const yaml = `
# This is a comment
docs:
  # another comment
  framework: nextra
`;
		expect(parseSynkAiYaml(yaml)?.docs.framework).toBe("nextra");
	});

	it("strips surrounding quotes from values", () => {
		const yaml = `
docs:
  path: "/docs"
`;
		expect(parseSynkAiYaml(yaml)?.docs.path).toBe("/docs");
	});

	it("handles tab indentation", () => {
		const yaml = "docs:\n\tframework: fumadocs\n";
		expect(parseSynkAiYaml(yaml)?.docs.framework).toBe("fumadocs");
	});

	it("returns null for invalid yaml", () => {
		const yaml = "docs:\n  framework: [";
		expect(parseSynkAiYaml(yaml)).toBeNull();
	});

	it("returns null when schema validation fails", () => {
		const yaml = `
docs:
  framework: nextra
unexpected: true
`;
		expect(parseSynkAiYaml(yaml)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// parseDocsConfigFromObject
// ---------------------------------------------------------------------------

describe("parseDocsConfigFromObject", () => {
	it("returns null for null input", () => {
		expect(parseDocsConfigFromObject(null)).toBeNull();
	});

	it("returns null for non-object input", () => {
		expect(parseDocsConfigFromObject("string")).toBeNull();
	});

	it("parses nested docs section", () => {
		const input = { docs: { framework: "docusaurus", path: "/docs" } };
		expect(parseDocsConfigFromObject(input)).toEqual({
			docs: { framework: "docusaurus", path: "/docs" },
			ignorePaths: [],
		});
	});

	it("parses triggers.ignore_paths", () => {
		const input = { triggers: { ignore_paths: ["*.lock", "dist/**"] } };
		expect(parseDocsConfigFromObject(input)?.ignorePaths).toEqual(["*.lock", "dist/**"]);
	});

	it("skips non-string entries in ignore_paths", () => {
		const input = { triggers: { ignore_paths: ["valid", 42, null, "also-valid"] } };
		expect(parseDocsConfigFromObject(input)?.ignorePaths).toEqual(["valid", "also-valid"]);
	});

	it("ignores unknown framework values", () => {
		const input = { docs: { framework: "jekyll" } };
		expect(parseDocsConfigFromObject(input)?.docs.framework).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// mergeResolvedConfig — config merging (file > db > auto-detected)
// ---------------------------------------------------------------------------

describe("mergeResolvedConfig", () => {
	it("prefers file config over database config", () => {
		const file = {
			docs: { framework: "nextra" as const, path: "/docs" },
			ignorePaths: ["*.test.ts"],
		};
		const db = {
			docs: { framework: "fumadocs" as const, path: "/content", repo: "acme/docs" },
			ignorePaths: ["dist/**"],
		};
		const result = mergeResolvedConfig(file, db);
		expect(result.docs.framework).toBe("nextra");
		expect(result.docs.path).toBe("/docs");
		expect(result.docs.repo).toBe("acme/docs");
		expect(result.ignorePaths).toEqual(["*.test.ts"]);
	});

	it("uses database config when file has no values", () => {
		const file = { docs: {}, ignorePaths: [] };
		const db = {
			docs: { framework: "docusaurus" as const, path: "/docs", branch: "main" },
			ignorePaths: ["*.lock"],
		};
		const result = mergeResolvedConfig(file, db);
		expect(result.docs.framework).toBe("docusaurus");
		expect(result.docs.path).toBe("/docs");
		expect(result.docs.branch).toBe("main");
		expect(result.ignorePaths).toEqual(["*.lock"]);
	});

	it("uses file ignorePaths when non-empty, else db", () => {
		const file = { docs: {}, ignorePaths: ["file-ignore"] };
		const db = { docs: {}, ignorePaths: ["db-ignore"] };
		expect(mergeResolvedConfig(file, db).ignorePaths).toEqual(["file-ignore"]);
		expect(mergeResolvedConfig({ docs: {}, ignorePaths: [] }, db).ignorePaths).toEqual([
			"db-ignore",
		]);
	});

	it("merges partial file overrides with db defaults", () => {
		const file = { docs: { framework: "auto" as const }, ignorePaths: [] };
		const db = {
			docs: { path: "/content", repo: "org/docs", branch: "develop" },
			ignorePaths: [],
		};
		const result = mergeResolvedConfig(file, db);
		expect(result.docs.framework).toBe("auto");
		expect(result.docs.path).toBe("/content");
		expect(result.docs.repo).toBe("org/docs");
		expect(result.docs.branch).toBe("develop");
	});
});

// ---------------------------------------------------------------------------
// processAnalyzeChangesJob — pipeline integration tests
// ---------------------------------------------------------------------------

describe("processAnalyzeChangesJob", () => {
	beforeEach(() => {
		vi.resetAllMocks();

		mockParseGitHubCredentialsEnvironment.mockReturnValue({});
		mockCredentialsFromEnvironment.mockReturnValue({ appId: "1", privateKey: "k" });
		mockCreateInstallationOctokit.mockReturnValue({});
		mockFetchPushDiff.mockResolvedValue([{ filename: "src/index.ts" }]);
		mockFetchFileContent.mockRejectedValue(notFoundError());
		mockFetchRepoTree.mockResolvedValue([]);
		mockFetchMultipleFiles.mockResolvedValue([]);

		mockFindUniqueRepository.mockResolvedValue(makeRepository());
		mockCreateAnalysisRun.mockResolvedValue({ id: "run-1" });
		mockUpdateAnalysisRun.mockResolvedValue({});

		const defaultAdapter = makeAdapter();
		mockDetectAdapter.mockResolvedValue(defaultAdapter);
		mockGetAdapter.mockReturnValue(defaultAdapter);
	});

	it("marks run as skipped when default-filtered diff is empty", async () => {
		// filterDiff returns empty on the first call (default ignore patterns) to
		// trigger the early-exit skip path.
		mockFilterDiff.mockReturnValueOnce([]).mockReturnValue([]);

		await processAnalyzeChangesJob(makeJob(), makeLogger());

		expect(mockUpdateAnalysisRun).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: "skipped" }),
			}),
		);
	});

	it("marks run as skipped when project-ignore-filtered diff is empty", async () => {
		// First filterDiff call (default patterns) keeps the file.
		// Second filterDiff call (project ignore paths) removes it.
		mockFilterDiff.mockReturnValueOnce([{ filename: "src/index.ts" }]).mockReturnValueOnce([]);

		// Provide a .synk-ai.yml with an ignore path to trigger the second filter.
		mockFetchFileContent.mockResolvedValueOnce({
			content: "triggers:\n  ignore_paths:\n    - src/**\n",
			path: ".synk-ai.yml",
			sha: "abc",
			size: 40,
		});

		await processAnalyzeChangesJob(makeJob(), makeLogger());

		expect(mockUpdateAnalysisRun).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: "skipped" }),
			}),
		);
	});

	it("marks run as completed with docsAffected=false when triage says no update needed", async () => {
		mockFilterDiff.mockReturnValue([{ filename: "src/index.ts" }]);

		const mockServices = {
			runTriage: vi.fn().mockResolvedValue({
				needsUpdate: false,
				affectedDocFiles: [],
				reasoning: "no change",
				tokenUsage: { prompt: 5, completion: 3, total: 8 },
			}),
			runGeneration: vi.fn(),
			createPullRequest: vi.fn(),
		};

		await processAnalyzeChangesJob(makeJob(), makeLogger(), mockServices);

		expect(mockUpdateAnalysisRun).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: "completed", docsAffected: false }),
			}),
		);
		expect(mockServices.runGeneration).not.toHaveBeenCalled();
	});

	it("marks run as completed with docsAffected=false when generation produces no meaningful changes", async () => {
		const originalContent = "# Docs\nNo change.";
		// Default diff filter keeps file; project filter keeps file;
		// pathMatchesAnyGlob invokes filterDiff which returns [] to signal a match.
		mockFilterDiff
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValue([]);

		mockFetchRepoTree.mockResolvedValue([{ path: "docs/index.md", sha: "s1", size: 100 }]);
		mockFetchMultipleFiles.mockResolvedValue([
			{ path: "docs/index.md", content: originalContent, sha: "s1", size: 100 },
		]);

		const adapter = makeAdapter();
		adapter.getDocPaths.mockReturnValue(["**/*.md"]);
		mockDetectAdapter.mockResolvedValue(adapter);
		mockGetAdapter.mockReturnValue(adapter);

		const mockServices = {
			runTriage: vi.fn().mockResolvedValue({
				needsUpdate: true,
				affectedDocFiles: ["docs/index.md"],
				reasoning: "change detected",
				tokenUsage: { prompt: 10, completion: 5, total: 15 },
			}),
			// Generation returns the same content → no meaningful change
			runGeneration: vi.fn().mockResolvedValue({
				path: "docs/index.md",
				content: originalContent,
				reasoning: "unchanged",
				tokenUsage: { prompt: 5, completion: 3, total: 8 },
			}),
			createPullRequest: vi.fn(),
		};

		await processAnalyzeChangesJob(makeJob(), makeLogger(), mockServices);

		expect(mockUpdateAnalysisRun).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: "completed", docsAffected: false }),
			}),
		);
		expect(mockServices.createPullRequest).not.toHaveBeenCalled();
	});

	it("stores resolved docs_config to repository for caching", async () => {
		mockFilterDiff
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValue([]);

		mockFetchRepoTree.mockResolvedValue([{ path: "docs/index.md", sha: "s1", size: 100 }]);
		mockFetchMultipleFiles.mockResolvedValue([
			{ path: "docs/index.md", content: "# Old", sha: "s1", size: 5 },
		]);

		const adapter = makeAdapter();
		adapter.getDocPaths.mockReturnValue(["**/*.md"]);
		mockDetectAdapter.mockResolvedValue(adapter);
		mockGetAdapter.mockReturnValue(adapter);

		const mockServices = {
			runTriage: vi.fn().mockResolvedValue({
				needsUpdate: true,
				affectedDocFiles: ["docs/index.md"],
				reasoning: "change",
				tokenUsage: { prompt: 10, completion: 5, total: 15 },
			}),
			runGeneration: vi.fn().mockResolvedValue({
				path: "docs/index.md",
				content: "# Updated",
				reasoning: "updated",
				tokenUsage: { prompt: 5, completion: 3, total: 8 },
			}),
			createPullRequest: vi.fn().mockResolvedValue({
				prNumber: 1,
				prUrl: "https://github.com/acme/app/pull/1",
			}),
		};

		await processAnalyzeChangesJob(makeJob(), makeLogger(), mockServices);

		expect(mockUpdateProviderRepository).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "repo-1" },
				data: expect.objectContaining({
					docsConfig: expect.objectContaining({
						docs: expect.objectContaining({ framework: "nextra" }),
						triggers: expect.objectContaining({ ignore_paths: expect.any(Array) }),
					}),
				}),
			}),
		);
	});

	it("detects framework from docs repo when docs.repo points to a separate repository", async () => {
		mockFilterDiff
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValue([]);
		mockFetchFileContent
			.mockResolvedValueOnce({
				content:
					"docs:\n  framework: auto\n  repo: acme/docs-site\n  branch: docs-main\n  path: docs\n",
				path: ".synk-ai.yml",
				sha: "cfg",
				size: 80,
			})
			.mockRejectedValue(notFoundError());
		mockFetchRepoTree.mockResolvedValue([{ path: "docs/index.md", sha: "s1", size: 100 }]);
		mockFetchMultipleFiles.mockResolvedValue([
			{ path: "docs/index.md", content: "# Old", sha: "s1", size: 5 },
		]);

		const adapter = makeAdapter();
		adapter.getDocPaths.mockReturnValue(["**/*.md"]);
		mockDetectAdapter.mockResolvedValue(adapter);
		mockGetAdapter.mockReturnValue(adapter);

		const mockServices = {
			runTriage: vi.fn().mockResolvedValue({
				needsUpdate: true,
				affectedDocFiles: ["docs/index.md"],
				reasoning: "change",
				tokenUsage: { prompt: 10, completion: 5, total: 15 },
			}),
			runGeneration: vi.fn().mockResolvedValue({
				path: "docs/index.md",
				content: "# Updated",
				reasoning: "updated",
				tokenUsage: { prompt: 5, completion: 3, total: 8 },
			}),
			createPullRequest: vi.fn().mockResolvedValue({
				prNumber: 100,
				prUrl: "https://github.com/acme/docs-site/pull/100",
			}),
		};

		await processAnalyzeChangesJob(makeJob(), makeLogger(), mockServices);

		expect(mockFetchRepoTree).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				owner: "acme",
				repo: "docs-site",
				ref: "docs-main",
			}),
		);
		expect(mockServices.createPullRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				owner: "acme",
				repo: "docs-site",
				baseBranch: "docs-main",
			}),
		);
	});

	it("marks run as completed with docsAffected=true and stores PR info when changes are produced", async () => {
		mockFilterDiff
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValue([]);

		mockFetchRepoTree.mockResolvedValue([{ path: "docs/index.md", sha: "s1", size: 100 }]);
		mockFetchMultipleFiles.mockResolvedValue([
			{ path: "docs/index.md", content: "# Old", sha: "s1", size: 5 },
		]);

		const adapter = makeAdapter();
		adapter.getDocPaths.mockReturnValue(["**/*.md"]);
		mockDetectAdapter.mockResolvedValue(adapter);
		mockGetAdapter.mockReturnValue(adapter);

		const mockServices = {
			runTriage: vi.fn().mockResolvedValue({
				needsUpdate: true,
				affectedDocFiles: ["docs/index.md"],
				reasoning: "change detected",
				tokenUsage: { prompt: 10, completion: 5, total: 15 },
			}),
			runGeneration: vi.fn().mockResolvedValue({
				path: "docs/index.md",
				content: "# New and improved",
				reasoning: "updated",
				tokenUsage: { prompt: 20, completion: 10, total: 30 },
			}),
			createPullRequest: vi.fn().mockResolvedValue({
				prNumber: 42,
				prUrl: "https://github.com/pr/42",
			}),
		};

		await processAnalyzeChangesJob(makeJob(), makeLogger(), mockServices);

		expect(mockUpdateAnalysisRun).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: "completed",
					docsAffected: true,
					docPrNumber: 42,
					docPrUrl: "https://github.com/pr/42",
				}),
			}),
		);
	});

	it("marks run as failed and rethrows when the pipeline throws", async () => {
		const pipelineError = new Error("GitHub API failure");
		mockFilterDiff
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValueOnce([{ filename: "src/index.ts" }]);
		mockFetchRepoTree.mockRejectedValue(pipelineError);

		const mockServices = {
			runTriage: vi.fn(),
			runGeneration: vi.fn(),
			createPullRequest: vi.fn(),
		};

		await expect(processAnalyzeChangesJob(makeJob(), makeLogger(), mockServices)).rejects.toThrow(
			"GitHub API failure",
		);

		expect(mockUpdateAnalysisRun).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: "failed",
					error: "GitHub API failure",
				}),
			}),
		);
	});

	it("throws without creating a run when credentials are missing", async () => {
		mockParseGitHubCredentialsEnvironment.mockImplementation(() => {
			throw new Error("Missing GITHUB_APP_ID");
		});

		await expect(processAnalyzeChangesJob(makeJob(), makeLogger())).rejects.toThrow(
			"Missing GITHUB_APP_ID",
		);

		// No run should have been created — the error happened before createInitialRun
		expect(mockCreateAnalysisRun).not.toHaveBeenCalled();
	});

	it("propagates the original pipeline error even when updateRunStatus also throws", async () => {
		const pipelineError = new Error("original pipeline failure");
		mockFilterDiff
			.mockReturnValueOnce([{ filename: "src/index.ts" }])
			.mockReturnValueOnce([{ filename: "src/index.ts" }]);
		mockFetchRepoTree.mockRejectedValue(pipelineError);

		// Simulate the DB being unavailable when we try to record the failure.
		mockUpdateAnalysisRun.mockRejectedValue(new Error("DB connection lost"));

		const mockServices = {
			runTriage: vi.fn(),
			runGeneration: vi.fn(),
			createPullRequest: vi.fn(),
		};

		// The original error must propagate — not the DB error.
		await expect(processAnalyzeChangesJob(makeJob(), makeLogger(), mockServices)).rejects.toThrow(
			"original pipeline failure",
		);
	});
});
