import { db } from "@synk-ai/db";
import {
	type DocAdapter,
	type DocFile,
	type DocsConfig,
	type RepoFile,
	detectAdapter,
	getAdapter,
} from "@synk-ai/doc-adapters";
import {
	type DiffFile,
	createDocUpdatePR,
	type RepoTreeFile,
	createInstallationOctokit,
	credentialsFromEnvironment,
	fetchFileContent,
	fetchMultipleFiles,
	fetchPRDiff,
	fetchPushDiff,
	fetchRepoTree,
	filterDiff,
	parseGitHubCredentialsEnvironment,
} from "@synk-ai/github";
import { type AnalyzeChangesJobPayload, parseSynkAiConfigFromYaml } from "@synk-ai/shared";
import type { Job } from "bullmq";
import type { Logger } from "../logger.js";

const PROVIDER_GITHUB = "github";
const RUN_STATUS_RUNNING = "running";
const RUN_STATUS_SKIPPED = "skipped";
const RUN_STATUS_COMPLETED = "completed";
const RUN_STATUS_FAILED = "failed";

type RepositoryWithInstallation = {
	id: string;
	provider: "github" | "gitlab" | "bitbucket";
	fullName: string;
	defaultBranch: string;
	docsConfig: unknown;
	installation: {
		id: string;
		provider: "github" | "gitlab" | "bitbucket";
		providerInstallationId: string;
		status: "active" | "suspended" | "deleted";
	};
};

type PullRequestResult = {
	prNumber: number;
	prUrl: string;
	branchName: string;
};

type PullRequestConfig = {
	labels: string[];
	assignees: string[];
	reviewers: string[];
	draft: boolean;
};

type TokenUsage = {
	prompt: number;
	completion: number;
	total: number;
};

export type AggregatedTokenUsage = {
	triage: TokenUsage;
	generation: TokenUsage;
	total: TokenUsage;
};

type TriageResult = {
	needsUpdate: boolean;
	affectedDocFiles: string[];
	reasoning: string;
	tokenUsage: TokenUsage;
};

type GenerationResult = {
	path: string;
	content: string;
	reasoning: string;
	tokenUsage: TokenUsage;
};

export type ResolvedDocsConfig = {
	docs: DocsConfig;
	ignorePaths: string[];
};

type PipelineContext = {
	owner: string;
	repo: string;
	defaultBranch: string;
	commitSha: string;
	ref: string;
};

type RepoLocation = {
	owner: string;
	repo: string;
	ref: string;
};

type AnalyzeChangesServices = {
	runTriage: (input: {
		filteredDiff: readonly DiffFile[];
		docTree: ReturnType<DocAdapter["parseStructure"]>;
		docFiles: readonly DocFile[];
		adapter: DocAdapter;
		docsConfig: DocsConfig;
	}) => Promise<TriageResult>;
	runGeneration: (input: {
		filteredDiff: readonly DiffFile[];
		docFile: DocFile;
		adapter: DocAdapter;
		docsConfig: DocsConfig;
	}) => Promise<GenerationResult>;
	createPullRequest: (input: {
		octokit: ReturnType<typeof createInstallationOctokit>;
		owner: string;
		repo: string;
		baseBranch: string;
		files: readonly { path: string; content: string; reasoning?: string }[];
		triggerInfo: AnalyzeChangesJobPayload["trigger"] & {
			sourceOwner: string;
			sourceRepo: string;
			prTitle?: string;
		};
		config: PullRequestConfig;
	}) => Promise<PullRequestResult>;
};

// The following pure utility functions are exported for unit testing.
// They are internal implementation details and not considered public API.

export const normalizeTokenUsage = (value: Partial<TokenUsage> | undefined): TokenUsage => {
	const prompt = value?.prompt ?? 0;
	const completion = value?.completion ?? 0;
	return {
		prompt,
		completion,
		total: value?.total ?? prompt + completion,
	};
};

export const aggregateTokenUsage = (
	triageUsage: TokenUsage,
	generationUsage: readonly TokenUsage[],
): AggregatedTokenUsage => {
	const generationPrompt = generationUsage.reduce((sum, usage) => sum + usage.prompt, 0);
	const generationCompletion = generationUsage.reduce((sum, usage) => sum + usage.completion, 0);
	const generationTotal = generationUsage.reduce((sum, usage) => sum + usage.total, 0);
	const totalPrompt = triageUsage.prompt + generationPrompt;
	const totalCompletion = triageUsage.completion + generationCompletion;
	const totalTokens = triageUsage.total + generationTotal;

	return {
		triage: triageUsage,
		generation: {
			prompt: generationPrompt,
			completion: generationCompletion,
			total: generationTotal,
		},
		total: {
			prompt: totalPrompt,
			completion: totalCompletion,
			total: totalTokens,
		},
	};
};

export const parseOwnerAndRepo = (fullName: string): { owner: string; repo: string } => {
	const [owner, repo] = fullName.split("/");
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0) {
		throw new Error(`Invalid repository fullName '${fullName}'. Expected owner/repo.`);
	}
	return { owner, repo };
};

export const parseInstallationId = (providerInstallationId: string): number => {
	const installationId = Number.parseInt(providerInstallationId, 10);
	if (!Number.isInteger(installationId) || installationId <= 0) {
		throw new Error(
			`Invalid providerInstallationId '${providerInstallationId}'. Expected positive integer.`,
		);
	}
	return installationId;
};

const isHttpNotFoundError = (error: unknown): boolean => {
	if (typeof error !== "object" || error === null || !("status" in error)) {
		return false;
	}
	return error.status === 404;
};

const parseStringValue = (value: unknown): string | undefined =>
	typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

const createDocsConfig = (input: {
	framework?: DocsConfig["framework"] | undefined;
	path?: string | undefined;
	repo?: string | undefined;
	branch?: string | undefined;
}): DocsConfig => {
	const docs: DocsConfig = {};
	if (input.framework !== undefined) {
		docs.framework = input.framework;
	}
	if (input.path !== undefined) {
		docs.path = input.path;
	}
	if (input.repo !== undefined) {
		docs.repo = input.repo;
	}
	if (input.branch !== undefined) {
		docs.branch = input.branch;
	}
	return docs;
};

export const parseDocsConfigFromObject = (value: unknown): ResolvedDocsConfig | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}

	const root = value as Record<string, unknown>;
	const docsNode =
		typeof root.docs === "object" && root.docs !== null
			? (root.docs as Record<string, unknown>)
			: root;
	const triggersNode =
		typeof root.triggers === "object" && root.triggers !== null
			? (root.triggers as Record<string, unknown>)
			: undefined;
	const ignorePaths = Array.isArray(triggersNode?.ignore_paths)
		? triggersNode.ignore_paths.filter((item): item is string => typeof item === "string")
		: [];

	const docs = createDocsConfig({
		framework: parseFramework(parseStringValue(docsNode.framework)),
		path: parseStringValue(docsNode.path),
		repo: parseStringValue(docsNode.repo),
		branch: parseStringValue(docsNode.branch),
	});

	return { docs, ignorePaths };
};

export const parseFramework = (framework: string | undefined): DocsConfig["framework"] => {
	switch (framework) {
		case "auto":
		case "nextra":
		case "fumadocs":
		case "docusaurus":
		case "markdown":
			return framework;
		default:
			return undefined;
	}
};

const DEFAULT_PULL_REQUEST_CONFIG: PullRequestConfig = {
	labels: ["synk-ai", "documentation"],
	assignees: [],
	reviewers: [],
	draft: false,
};

const parseStringList = (value: unknown): string[] | undefined => {
	if (!Array.isArray(value)) {
		return undefined;
	}
	return value.filter((item): item is string => typeof item === "string");
};

const parsePrConfigFromObject = (value: unknown): Partial<PullRequestConfig> | null => {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const root = value as Record<string, unknown>;
	if (typeof root.pr !== "object" || root.pr === null) {
		return null;
	}
	const prNode = root.pr as Record<string, unknown>;
	const labels = parseStringList(prNode.labels);
	const assignees = parseStringList(prNode.assignees);
	const reviewers = parseStringList(prNode.reviewers);
	const draft = typeof prNode.draft === "boolean" ? prNode.draft : undefined;
	const config: Partial<PullRequestConfig> = {};
	if (labels !== undefined) {
		config.labels = labels;
	}
	if (assignees !== undefined) {
		config.assignees = assignees;
	}
	if (reviewers !== undefined) {
		config.reviewers = reviewers;
	}
	if (draft !== undefined) {
		config.draft = draft;
	}
	return config;
};

const mergePrConfig = (
	fileConfig: Partial<PullRequestConfig> | null,
	dbConfig: Partial<PullRequestConfig> | null,
): PullRequestConfig => ({
	labels: fileConfig?.labels ?? dbConfig?.labels ?? [...DEFAULT_PULL_REQUEST_CONFIG.labels],
	assignees: fileConfig?.assignees ?? dbConfig?.assignees ?? [...DEFAULT_PULL_REQUEST_CONFIG.assignees],
	reviewers: fileConfig?.reviewers ?? dbConfig?.reviewers ?? [...DEFAULT_PULL_REQUEST_CONFIG.reviewers],
	draft: fileConfig?.draft ?? dbConfig?.draft ?? DEFAULT_PULL_REQUEST_CONFIG.draft,
});

/**
 * Parses .synk-ai.yml content using Zod schema. Returns ResolvedDocsConfig for
 * use in the pipeline. Re-exports shared parser for backward compatibility.
 */
export const parseSynkAiYaml = (content: string): ResolvedDocsConfig | null => {
	const parsed = parseSynkAiConfigFromYaml(content);
	if (parsed === null) {
		return null;
	}
	const docs: DocsConfig = {};
	if (parsed.docs.framework !== undefined) docs.framework = parsed.docs.framework;
	if (parsed.docs.path !== undefined) docs.path = parsed.docs.path;
	if (parsed.docs.repo !== undefined) docs.repo = parsed.docs.repo;
	if (parsed.docs.branch !== undefined) docs.branch = parsed.docs.branch;
	return { docs, ignorePaths: parsed.ignorePaths };
};

// Returns true when `path` matches any of the provided glob patterns.
// Uses filterDiff as the matching engine: filterDiff removes files that match
// its pattern list, so an empty result means the path was matched and removed.
const pathMatchesAnyGlob = (path: string, globPatterns: readonly string[]): boolean => {
	if (globPatterns.length === 0) {
		return false;
	}

	const fakeDiff: DiffFile = {
		filename: path,
		status: "modified",
		additions: 0,
		deletions: 0,
		patch: null,
		previousFilename: null,
	};
	return filterDiff([fakeDiff], globPatterns).length === 0;
};

const fetchDiffForTrigger = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	context: PipelineContext,
	trigger: AnalyzeChangesJobPayload["trigger"],
): Promise<DiffFile[]> => {
	if (trigger.type === "merge") {
		if (trigger.prNumber === undefined) {
			throw new Error("Merge trigger requires prNumber but none was provided.");
		}
		return fetchPRDiff(octokit, {
			owner: context.owner,
			repo: context.repo,
			prNumber: trigger.prNumber,
		});
	}

	return fetchPushDiff(octokit, {
		owner: context.owner,
		repo: context.repo,
		before: `${trigger.commitSha}^`,
		after: trigger.commitSha,
	});
};

const resolveDocsConfig = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	context: PipelineContext,
	repository: RepositoryWithInstallation,
): Promise<ResolvedDocsConfig> => {
	let fromFile: ResolvedDocsConfig | null = null;
	try {
		const configFile = await fetchFileContent(octokit, {
			owner: context.owner,
			repo: context.repo,
			path: ".synk-ai.yml",
			ref: context.commitSha,
		});
		const parsed = parseSynkAiConfigFromYaml(configFile.content);
		if (parsed !== null) {
			const docs: DocsConfig = {};
			if (parsed.docs.framework !== undefined) docs.framework = parsed.docs.framework;
			if (parsed.docs.path !== undefined) docs.path = parsed.docs.path;
			if (parsed.docs.repo !== undefined) docs.repo = parsed.docs.repo;
			if (parsed.docs.branch !== undefined) docs.branch = parsed.docs.branch;
			fromFile = { docs, ignorePaths: parsed.ignorePaths };
		}
	} catch (error) {
		if (!isHttpNotFoundError(error)) {
			throw error;
		}
		// File not found — expected for repositories without .synk-ai.yml.
	}

	const fromDatabase = parseDocsConfigFromObject(repository.docsConfig);

	// Config merging: file config > database config > auto-detected defaults
	return mergeResolvedConfig(
		fromFile ?? { docs: {}, ignorePaths: [] },
		fromDatabase ?? { docs: {}, ignorePaths: [] },
	);
};

const resolvePrConfig = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	context: PipelineContext,
	repository: RepositoryWithInstallation,
): Promise<PullRequestConfig> => {
	let fromFile: Partial<PullRequestConfig> | null = null;
	try {
		const configFile = await fetchFileContent(octokit, {
			owner: context.owner,
			repo: context.repo,
			path: ".synk-ai.yml",
			ref: context.commitSha,
		});
		const parsed = parseSynkAiConfigFromYaml(configFile.content);
		if (parsed !== null) {
			fromFile = {
				labels: [...parsed.pr.labels],
				assignees: [...parsed.pr.assignees],
				reviewers: [...parsed.pr.reviewers],
				draft: parsed.pr.draft,
			};
		}
	} catch (error) {
		if (!isHttpNotFoundError(error)) {
			throw error;
		}
	}

	const fromDatabase = parsePrConfigFromObject(repository.docsConfig);
	return mergePrConfig(fromFile, fromDatabase);
};

export const mergeResolvedConfig = (
	file: ResolvedDocsConfig,
	db: ResolvedDocsConfig,
): ResolvedDocsConfig => {
	const docs: DocsConfig = {};
	const framework = file.docs.framework ?? db.docs.framework;
	const path = file.docs.path ?? db.docs.path;
	const repo = file.docs.repo ?? db.docs.repo;
	const branch = file.docs.branch ?? db.docs.branch;
	if (framework !== undefined) docs.framework = framework;
	if (path !== undefined) docs.path = path;
	if (repo !== undefined) docs.repo = repo;
	if (branch !== undefined) docs.branch = branch;
	const ignorePaths = file.ignorePaths.length > 0 ? file.ignorePaths : db.ignorePaths;
	return { docs, ignorePaths };
};

type AdapterResolution = {
	adapter: DocAdapter;
	// Present only when auto-detection was performed; undefined when the
	// framework was configured explicitly (no tree fetch needed).
	detectionTree: readonly RepoTreeFile[] | undefined;
};

const resolveDetectionLocation = (
	context: PipelineContext,
	docsLocation: RepoLocation,
): RepoLocation => {
	if (docsLocation.owner === context.owner && docsLocation.repo === context.repo) {
		return {
			owner: context.owner,
			repo: context.repo,
			ref: context.commitSha,
		};
	}
	return docsLocation;
};

const resolveAdapter = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	detectionLocation: RepoLocation,
	docsConfig: DocsConfig,
): Promise<AdapterResolution> => {
	if (docsConfig.framework !== undefined && docsConfig.framework !== "auto") {
		return { adapter: getAdapter(docsConfig.framework), detectionTree: undefined };
	}

	const detectionTree = await fetchRepoTree(octokit, {
		owner: detectionLocation.owner,
		repo: detectionLocation.repo,
		ref: detectionLocation.ref,
	});
	const packageJsonContent = await readPackageJsonContent(octokit, detectionLocation);
	const repoFiles: RepoFile[] = detectionTree.map((file) => ({
		path: file.path,
		sha: file.sha,
		size: file.size,
	}));
	const adapter = await detectAdapter(
		repoFiles,
		packageJsonContent === undefined ? undefined : { packageJson: packageJsonContent },
	);
	return { adapter, detectionTree };
};

const readPackageJsonContent = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	location: RepoLocation,
): Promise<string | undefined> => {
	try {
		const packageJson = await fetchFileContent(octokit, {
			owner: location.owner,
			repo: location.repo,
			path: "package.json",
			ref: location.ref,
		});
		return packageJson.content;
	} catch (error) {
		if (!isHttpNotFoundError(error)) {
			throw error;
		}
		return undefined;
	}
};

const resolveDocsLocation = (
	repositoryFullName: string,
	defaultBranch: string,
	docsConfig: DocsConfig,
): RepoLocation => {
	const configuredRepo = docsConfig.repo ?? repositoryFullName;
	const { owner, repo } = parseOwnerAndRepo(configuredRepo);
	return {
		owner,
		repo,
		ref: docsConfig.branch ?? defaultBranch,
	};
};

type CollectDocFilesOptions = {
	docsConfig: DocsConfig;
	location: { owner: string; repo: string; ref: string };
	// When the docs repo is the same as the source repo and a tree was already
	// fetched during adapter auto-detection, pass it here to avoid a second
	// identical GitHub API call.
	prefetchedTree?: readonly RepoTreeFile[] | undefined;
};

const collectDocFiles = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	adapter: DocAdapter,
	options: CollectDocFilesOptions,
): Promise<{ tree: readonly RepoTreeFile[]; docFiles: readonly DocFile[] }> => {
	const { docsConfig, location } = options;
	const tree =
		options.prefetchedTree ??
		(await fetchRepoTree(octokit, {
			owner: location.owner,
			repo: location.repo,
			ref: location.ref,
		}));
	const globs = adapter.getDocPaths(docsConfig);
	const docPaths = tree
		.map((entry) => entry.path)
		.filter((path) => pathMatchesAnyGlob(path, globs))
		.slice(0, 500);
	if (docPaths.length === 0) {
		return { tree, docFiles: [] };
	}

	const files = await fetchMultipleFiles(octokit, {
		owner: location.owner,
		repo: location.repo,
		paths: docPaths,
		ref: location.ref,
	});
	return {
		tree,
		docFiles: files.map((file) => ({ path: file.path, content: file.content })),
	};
};

const storeResolvedDocsConfig = async (
	repositoryId: string,
	docsConfig: DocsConfig,
	ignorePaths: string[],
	previousConfig: unknown,
): Promise<void> => {
	const baseConfig =
		typeof previousConfig === "object" && previousConfig !== null
			? ({ ...previousConfig } as Record<string, unknown>)
			: {};
	const existingTriggers =
		typeof baseConfig.triggers === "object" && baseConfig.triggers !== null
			? ({ ...baseConfig.triggers } as Record<string, unknown>)
			: {};
	const docs: Record<string, unknown> = {};
	if (docsConfig.framework !== undefined) docs.framework = docsConfig.framework;
	if (docsConfig.path !== undefined) docs.path = docsConfig.path;
	if (docsConfig.repo !== undefined) docs.repo = docsConfig.repo;
	if (docsConfig.branch !== undefined) docs.branch = docsConfig.branch;
	const configJson = {
		...baseConfig,
		docs,
		triggers: {
			...existingTriggers,
			ignore_paths: ignorePaths,
		},
	};
	await db.providerRepository.update({
		where: { id: repositoryId },
		data: { docsConfig: configJson },
	});
};

const updateRunStatus = async (
	runId: string,
	status: "running" | "completed" | "skipped" | "failed",
	data: {
		error?: string;
		docsAffected?: boolean;
		docPrUrl?: string;
		docPrNumber?: number;
		tokenUsage?: AggregatedTokenUsage;
		result?: Record<string, unknown>;
	},
): Promise<void> => {
	await db.analysisRun.update({
		where: { id: runId },
		data: {
			status,
			error: data.error ?? null,
			docsAffected: data.docsAffected ?? null,
			docPrUrl: data.docPrUrl ?? null,
			docPrNumber: data.docPrNumber ?? null,
			tokenUsage: data.tokenUsage ?? {},
			result: data.result ?? {},
			completedAt: status === RUN_STATUS_RUNNING ? null : new Date(),
		},
	});
};

const defaultRunTriage: AnalyzeChangesServices["runTriage"] = async (input) => {
	const docsPathPrefix = input.docsConfig.path?.replace(/^\/|\/$/gu, "");
	const candidateFiles = input.filteredDiff
		.map((file) => file.filename)
		.filter((path) => path.endsWith(".md") || path.endsWith(".mdx"))
		.filter((path) =>
			docsPathPrefix === undefined ? true : path.startsWith(`${docsPathPrefix}/`),
		);
	const existingDocPaths = new Set(input.docFiles.map((file) => file.path));
	const affectedDocFiles = candidateFiles.filter((path) => existingDocPaths.has(path));

	if (affectedDocFiles.length === 0) {
		return {
			needsUpdate: false,
			affectedDocFiles: [],
			reasoning:
				"Fallback triage did not find direct markdown documentation file changes in the filtered diff.",
			tokenUsage: normalizeTokenUsage(undefined),
		};
	}

	return {
		needsUpdate: true,
		affectedDocFiles,
		reasoning: "Fallback triage found documentation files touched by the commit diff.",
		tokenUsage: normalizeTokenUsage(undefined),
	};
};

const defaultRunGeneration: AnalyzeChangesServices["runGeneration"] = async (input) => {
	return {
		path: input.docFile.path,
		content: input.docFile.content,
		reasoning:
			"Fallback generation does not synthesize new text yet and keeps original document content unchanged.",
		tokenUsage: normalizeTokenUsage(undefined),
	};
};

const defaultCreatePullRequest: AnalyzeChangesServices["createPullRequest"] = async (input) =>
	createDocUpdatePR(input.octokit, {
		owner: input.owner,
		repo: input.repo,
		baseBranch: input.baseBranch,
		files: input.files,
		triggerInfo: input.triggerInfo,
		config: input.config,
	});

const measureStep = async <TValue>(
	logger: Logger,
	runId: string,
	step: string,
	handler: () => Promise<TValue>,
): Promise<{ value: TValue; durationMs: number }> => {
	const startedAt = Date.now();
	logger.info({ runId, step }, "starting pipeline step");
	const value = await handler();
	const durationMs = Date.now() - startedAt;
	logger.info({ runId, step, durationMs }, "completed pipeline step");
	return { value, durationMs };
};

const loadRepository = async (
	payload: AnalyzeChangesJobPayload,
): Promise<RepositoryWithInstallation> => {
	const repository = await db.providerRepository.findUnique({
		where: { id: payload.repositoryId },
		select: {
			id: true,
			provider: true,
			fullName: true,
			defaultBranch: true,
			docsConfig: true,
			installation: {
				select: {
					id: true,
					provider: true,
					providerInstallationId: true,
					status: true,
				},
			},
		},
	});
	if (repository === null) {
		throw new Error(`Repository '${payload.repositoryId}' was not found.`);
	}
	if (repository.provider !== PROVIDER_GITHUB) {
		throw new Error(`Unsupported repository provider '${repository.provider}'.`);
	}
	if (repository.installation.id !== payload.installationId) {
		throw new Error("Job installationId does not match repository installation.");
	}
	if (repository.installation.status !== "active") {
		throw new Error(
			`Repository installation is not active (status: ${repository.installation.status}).`,
		);
	}
	return repository;
};

const createInitialRun = async (
	job: Job<AnalyzeChangesJobPayload>,
	repository: RepositoryWithInstallation,
): Promise<string> => {
	const run = await db.analysisRun.create({
		data: {
			repositoryId: repository.id,
			provider: repository.provider,
			triggerType: job.data.trigger.type,
			triggerRef: job.data.trigger.ref,
			triggerCommitSha: job.data.trigger.commitSha,
			triggerMergeRequestNumber: job.data.trigger.prNumber ?? null,
			triggerMeta: {
				bullmq: {
					jobId: job.id ?? null,
					attemptNumber: job.attemptsMade + 1,
				},
			},
			status: RUN_STATUS_RUNNING,
			startedAt: new Date(),
			attemptCount: job.attemptsMade + 1,
		},
		select: {
			id: true,
		},
	});
	return run.id;
};

const buildPipelineContext = (
	repository: RepositoryWithInstallation,
	trigger: AnalyzeChangesJobPayload["trigger"],
): PipelineContext => {
	const { owner, repo } = parseOwnerAndRepo(repository.fullName);
	return {
		owner,
		repo,
		defaultBranch: repository.defaultBranch,
		commitSha: trigger.commitSha,
		ref: trigger.ref,
	};
};

const defaultServices: AnalyzeChangesServices = {
	runTriage: defaultRunTriage,
	runGeneration: defaultRunGeneration,
	createPullRequest: defaultCreatePullRequest,
};

export const processAnalyzeChangesJob = async (
	job: Job<AnalyzeChangesJobPayload>,
	logger: Logger,
	services: AnalyzeChangesServices = defaultServices,
): Promise<void> => {
	const jobLogger = logger.child({
		jobId: job.id ?? "unknown",
		attemptNumber: job.attemptsMade + 1,
		queue: job.queueName,
	});
	jobLogger.info({ payload: job.data }, "processing analyze changes job");

	const repository = await loadRepository(job.data);
	// Credential parsing must succeed before we create the run record. A failure
	// here is a deployment configuration error — retrying the job won't fix it,
	// and we should not produce a "failed" run entry for it.
	const credentials = credentialsFromEnvironment(parseGitHubCredentialsEnvironment());
	const runId = await createInitialRun(job, repository);
	const timings: Record<string, number> = {};
	let triageUsage = normalizeTokenUsage(undefined);
	const generationUsage: TokenUsage[] = [];

	try {
		const context = buildPipelineContext(repository, job.data.trigger);
		const installationId = parseInstallationId(repository.installation.providerInstallationId);
		const { value: octokit, durationMs: createOctokitDurationMs } = await measureStep(
			jobLogger,
			runId,
			"create-installation-octokit",
			async () => createInstallationOctokit(installationId, credentials),
		);
		timings.createInstallationOctokit = createOctokitDurationMs;

		const { value: rawDiff, durationMs: fetchDiffDurationMs } = await measureStep(
			jobLogger,
			runId,
			"fetch-diff",
			async () => fetchDiffForTrigger(octokit, context, job.data.trigger),
		);
		timings.fetchDiff = fetchDiffDurationMs;

		const { value: filteredDiff, durationMs: filterDiffDurationMs } = await measureStep(
			jobLogger,
			runId,
			"filter-diff",
			async () => filterDiff(rawDiff),
		);
		timings.filterDiff = filterDiffDurationMs;
		if (filteredDiff.length === 0) {
			await updateRunStatus(runId, RUN_STATUS_SKIPPED, {
				docsAffected: false,
				result: {
					timingsMs: timings,
					reason: "No relevant code changes after default ignore-path filtering.",
				},
			});
			return;
		}

		const { value: resolvedConfig, durationMs: resolveConfigDurationMs } = await measureStep(
			jobLogger,
			runId,
			"resolve-docs-config",
			async () => resolveDocsConfig(octokit, context, repository),
		);
		timings.resolveDocsConfig = resolveConfigDurationMs;
		const { value: prConfig, durationMs: resolvePrConfigDurationMs } = await measureStep(
			jobLogger,
			runId,
			"resolve-pr-config",
			async () => resolvePrConfig(octokit, context, repository),
		);
		timings.resolvePrConfig = resolvePrConfigDurationMs;
		const filteredDiffWithProjectIgnores = filterDiff(filteredDiff, resolvedConfig.ignorePaths);
		if (filteredDiffWithProjectIgnores.length === 0) {
			await updateRunStatus(runId, RUN_STATUS_SKIPPED, {
				docsAffected: false,
				result: {
					timingsMs: timings,
					reason: "No relevant code changes after repository-specific ignore-path filtering.",
				},
			});
			return;
		}

		const docsLocation = resolveDocsLocation(
			repository.fullName,
			repository.defaultBranch,
			resolvedConfig.docs,
		);
		const detectionLocation = resolveDetectionLocation(context, docsLocation);
		const { value: adapterResolution, durationMs: detectAdapterDurationMs } = await measureStep(
			jobLogger,
			runId,
			"detect-doc-adapter",
			async () => resolveAdapter(octokit, detectionLocation, resolvedConfig.docs),
		);
		timings.detectDocAdapter = detectAdapterDurationMs;
		const resolvedFramework =
			resolvedConfig.docs.framework === undefined || resolvedConfig.docs.framework === "auto"
				? parseFramework(adapterResolution.adapter.frameworkId)
				: resolvedConfig.docs.framework;
		const docsConfig = createDocsConfig({
			framework: resolvedFramework,
			path: resolvedConfig.docs.path,
			repo: resolvedConfig.docs.repo,
			branch: resolvedConfig.docs.branch,
		});

		await storeResolvedDocsConfig(
			repository.id,
			docsConfig,
			resolvedConfig.ignorePaths,
			repository.docsConfig,
		);

		// Re-use the tree fetched during auto-detection when the docs repository
		// is the same as the source repository to avoid a duplicate GitHub API call.
		const docsIsSameAsSourceRepo =
			docsLocation.owner === context.owner && docsLocation.repo === context.repo;
		const { value: docData, durationMs: fetchDocsDurationMs } = await measureStep(
			jobLogger,
			runId,
			"fetch-doc-tree-and-files",
			async () =>
				collectDocFiles(octokit, adapterResolution.adapter, {
					docsConfig,
					location: docsLocation,
					prefetchedTree: docsIsSameAsSourceRepo ? adapterResolution.detectionTree : undefined,
				}),
		);
		timings.fetchDocTreeAndFiles = fetchDocsDurationMs;

		const docTree = adapterResolution.adapter.parseStructure([...docData.docFiles]);
		const { value: triageResult, durationMs: triageDurationMs } = await measureStep(
			jobLogger,
			runId,
			"run-ai-triage",
			async () =>
				services.runTriage({
					filteredDiff: filteredDiffWithProjectIgnores,
					docTree,
					docFiles: docData.docFiles,
					adapter: adapterResolution.adapter,
					docsConfig,
				}),
		);
		timings.runAiTriage = triageDurationMs;
		triageUsage = normalizeTokenUsage(triageResult.tokenUsage);
		if (!triageResult.needsUpdate) {
			await updateRunStatus(runId, RUN_STATUS_COMPLETED, {
				docsAffected: false,
				tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
				result: {
					timingsMs: timings,
					triage: triageResult,
				},
			});
			return;
		}

		const docFileByPath = new Map(docData.docFiles.map((file) => [file.path, file]));
		const generationOutputs: GenerationResult[] = [];
		const generationStartedAt = Date.now();
		for (const docPath of triageResult.affectedDocFiles) {
			const docFile = docFileByPath.get(docPath);
			if (docFile === undefined) {
				continue;
			}

			const generationResult = await services.runGeneration({
				filteredDiff: filteredDiffWithProjectIgnores,
				docFile,
				adapter: adapterResolution.adapter,
				docsConfig,
			});
			generationOutputs.push(generationResult);
			generationUsage.push(normalizeTokenUsage(generationResult.tokenUsage));
		}
		timings.runAiGeneration = Date.now() - generationStartedAt;

		const meaningfulChanges: { path: string; content: string; reasoning?: string }[] = [];
		for (const output of generationOutputs) {
			const currentFile = docFileByPath.get(output.path);
			if (currentFile === undefined) {
				continue;
			}
			if (currentFile.content === output.content) {
				continue;
			}
			meaningfulChanges.push({
				path: output.path,
				content: output.content,
				reasoning: output.reasoning,
			});
		}
		if (meaningfulChanges.length === 0) {
			await updateRunStatus(runId, RUN_STATUS_COMPLETED, {
				docsAffected: false,
				tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
				result: {
					timingsMs: timings,
					triage: triageResult,
					generation: generationOutputs.map((output) => ({
						path: output.path,
						reasoning: output.reasoning,
					})),
				},
			});
			return;
		}

		const { value: prResult, durationMs: createPrDurationMs } = await measureStep(
			jobLogger,
			runId,
			"create-pr",
			async () =>
				services.createPullRequest({
					octokit,
					owner: docsLocation.owner,
					repo: docsLocation.repo,
					baseBranch: docsLocation.ref,
					files: meaningfulChanges,
					triggerInfo: {
						...job.data.trigger,
						sourceOwner: context.owner,
						sourceRepo: context.repo,
					},
					config: prConfig,
				}),
		);
		timings.createPr = createPrDurationMs;

		await updateRunStatus(runId, RUN_STATUS_COMPLETED, {
			docsAffected: true,
			docPrNumber: prResult.prNumber,
			docPrUrl: prResult.prUrl,
			tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
			result: {
				timingsMs: timings,
				triage: triageResult,
				generation: generationOutputs.map((output) => ({
					path: output.path,
					reasoning: output.reasoning,
				})),
			},
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown analyze-changes failure";
		try {
			await updateRunStatus(runId, RUN_STATUS_FAILED, {
				error: errorMessage,
				tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
				result: {
					timingsMs: timings,
				},
			});
		} catch {
			// Swallow status-update failures so the original pipeline error always
			// propagates to BullMQ for correct retry tracking.
		}
		throw error;
	}
};
