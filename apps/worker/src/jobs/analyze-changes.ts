import { createHash } from "node:crypto";
import { type Prisma, db } from "@synk-ai/db";
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
	type RepoTreeFile,
	createDocUpdatePR,
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
import {
	type AnalyzeChangesJobPayload,
	type ParsedSynkAiConfig,
	parseSynkAiConfigFromYaml,
} from "@synk-ai/shared";
import { type Job, UnrecoverableError } from "bullmq";
import type { Logger } from "../logger";
import { classifyError } from "./error-classification";

const PROVIDER_GITHUB = "github";
const RUN_STATUS_RUNNING = "running";
const RUN_STATUS_SKIPPED = "skipped";
const RUN_STATUS_COMPLETED = "completed";
const RUN_STATUS_FAILED = "failed";
const RUN_ERROR_CODE_UNKNOWN = "unknown";
const RUN_ERROR_CODE_NON_RETRYABLE = "non_retryable";
const RUN_ERROR_CODE_RETRYABLE = "retryable";

type RepositoryWithInstallation = {
	id: string;
	provider: "github" | "gitlab" | "bitbucket";
	fullName: string;
	defaultBranch: string;
	projectId: string;
	sourceRepositoryId: string;
	docsRepositoryId: string | null;
	projectConfig: unknown;
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

type SuggestionDraft = {
	docPath: string;
	baseDocSha: string;
	beforeContent: string;
	proposedContent: string;
	reasoning?: string;
};

type PersistedSuggestion = {
	id: string;
	docPath: string;
	fingerprint: string;
};

type SkippedSuggestion = {
	docPath: string;
	fingerprint: string;
	reason: "duplicate-pending-or-accepted" | "declined-decision-memory";
};

type SuggestionPersistenceOutcome = {
	persisted: readonly PersistedSuggestion[];
	skipped: readonly SkippedSuggestion[];
};

type ExistingSuggestion = {
	id: string;
	status: "pending" | "accepted" | "declined" | "superseded" | "stale" | "applied";
};

type AnalyzeChangesOptions = {
	autoPrEnabled: boolean;
	decisionMemoryEnabled: boolean;
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

/**
 * Parses GitHub credentials from the environment or throws an UnrecoverableError
 * if the configuration is missing or invalid. A credentials error is a
 * deployment configuration problem that retrying won't fix.
 */
const parseCredentialsOrFail = (): ReturnType<typeof credentialsFromEnvironment> => {
	try {
		return credentialsFromEnvironment(parseGitHubCredentialsEnvironment());
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Invalid GitHub credentials configuration";
		throw new UnrecoverableError(message);
	}
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

const resolveErrorCode = (
	error: unknown,
	classification: "retryable" | "non-retryable",
): string => {
	if (typeof error === "object" && error !== null && "status" in error) {
		const statusCandidate = (error as Record<string, unknown>).status;
		if (typeof statusCandidate === "number" && Number.isInteger(statusCandidate)) {
			return `http_${statusCandidate}`;
		}
	}
	if (classification === "non-retryable") {
		return RUN_ERROR_CODE_NON_RETRYABLE;
	}
	if (classification === "retryable") {
		return RUN_ERROR_CODE_RETRYABLE;
	}
	return RUN_ERROR_CODE_UNKNOWN;
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
	assignees: fileConfig?.assignees ??
		dbConfig?.assignees ?? [...DEFAULT_PULL_REQUEST_CONFIG.assignees],
	reviewers: fileConfig?.reviewers ??
		dbConfig?.reviewers ?? [...DEFAULT_PULL_REQUEST_CONFIG.reviewers],
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
	return resolveDocsConfigFromParsedFile(parsed);
};

const resolveDocsConfigFromParsedFile = (parsed: ParsedSynkAiConfig): ResolvedDocsConfig => {
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

const readSynkAiConfigFromFile = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	context: PipelineContext,
): Promise<ParsedSynkAiConfig | null> => {
	try {
		const configFile = await fetchFileContent(octokit, {
			owner: context.owner,
			repo: context.repo,
			path: ".synk-ai.yml",
			ref: context.commitSha,
		});
		return parseSynkAiConfigFromYaml(configFile.content);
	} catch (error) {
		if (!isHttpNotFoundError(error)) {
			throw error;
		}
		return null;
	}
};

const resolveDocsConfig = (
	repository: RepositoryWithInstallation,
	synkAiFileConfig: ParsedSynkAiConfig | null,
): ResolvedDocsConfig => {
	const fromFile =
		synkAiFileConfig === null ? null : resolveDocsConfigFromParsedFile(synkAiFileConfig);

	const fromDatabase = parseDocsConfigFromObject(repository.projectConfig);

	// Config merging: file config > database config > auto-detected defaults
	return mergeResolvedConfig(
		fromFile ?? { docs: {}, ignorePaths: [] },
		fromDatabase ?? { docs: {}, ignorePaths: [] },
	);
};

const resolvePrConfig = (
	repository: RepositoryWithInstallation,
	synkAiFileConfig: ParsedSynkAiConfig | null,
): PullRequestConfig => {
	const fromFile =
		synkAiFileConfig === null
			? null
			: {
					labels: [...synkAiFileConfig.pr.labels],
					assignees: [...synkAiFileConfig.pr.assignees],
					reviewers: [...synkAiFileConfig.pr.reviewers],
					draft: synkAiFileConfig.pr.draft,
				};

	const fromDatabase = parsePrConfigFromObject(repository.projectConfig);
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
): Promise<{
	tree: readonly RepoTreeFile[];
	docFiles: readonly DocFile[];
	docShaByPath: ReadonlyMap<string, string>;
}> => {
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
		return { tree, docFiles: [], docShaByPath: new Map<string, string>() };
	}

	const files = await fetchMultipleFiles(octokit, {
		owner: location.owner,
		repo: location.repo,
		paths: docPaths,
		ref: location.ref,
	});
	const docShaByPath = new Map(files.map((file) => [file.path, file.sha]));
	return {
		tree,
		docFiles: files.map((file) => ({ path: file.path, content: file.content })),
		docShaByPath,
	};
};

const storeResolvedDocsConfig = async (
	projectId: string,
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
	await db.project.update({
		where: { id: projectId },
		data: { config: configJson as unknown as Prisma.InputJsonValue },
	});
};

const updateRunStatus = async (
	runId: string,
	status: "running" | "completed" | "skipped" | "failed",
	data: {
		errorCode?: string;
		errorMessage?: string;
		docsAffected?: boolean;
		docPrUrl?: string;
		docPrNumber?: number;
		suggestionsCount?: number;
		tokenUsage?: AggregatedTokenUsage;
		result?: Record<string, unknown>;
	},
): Promise<void> => {
	await db.analysisRun.update({
		where: { id: runId },
		data: {
			status,
			errorCode: data.errorCode ?? null,
			errorMessage: data.errorMessage ?? null,
			error: data.errorMessage ?? null,
			docsAffected: data.docsAffected ?? null,
			docPrUrl: data.docPrUrl ?? null,
			docPrNumber: data.docPrNumber ?? null,
			suggestionsCount: data.suggestionsCount ?? 0,
			tokenUsage: data.tokenUsage ?? {},
			result: (data.result ?? {}) as unknown as Prisma.InputJsonValue,
			completedAt: status === RUN_STATUS_RUNNING ? null : new Date(),
		},
	});
};

const buildSuggestionFingerprint = (input: {
	projectId: string;
	repositoryId: string;
	docPath: string;
	baseDocSha: string;
	proposedContent: string;
}): string => {
	const raw = [
		input.projectId,
		input.repositoryId,
		input.docPath,
		input.baseDocSha,
		input.proposedContent,
	].join(":");
	return createHash("sha256").update(raw).digest("hex");
};

const shouldSkipEquivalentSuggestion = (
	existing: ExistingSuggestion | null,
	decisionMemoryEnabled: boolean,
): SkippedSuggestion["reason"] | null => {
	if (existing === null) {
		return null;
	}
	if (existing.status === "pending" || existing.status === "accepted") {
		return "duplicate-pending-or-accepted";
	}
	if (existing.status === "declined" && decisionMemoryEnabled) {
		return "declined-decision-memory";
	}
	return null;
};

const persistSuggestions = async (input: {
	projectId: string;
	repositoryId: string;
	runId: string;
	suggestions: readonly SuggestionDraft[];
	decisionMemoryEnabled: boolean;
}): Promise<SuggestionPersistenceOutcome> =>
	db.$transaction(async (tx) => {
		const persisted: PersistedSuggestion[] = [];
		const skipped: SkippedSuggestion[] = [];
		for (const suggestion of input.suggestions) {
			const fingerprint = buildSuggestionFingerprint({
				projectId: input.projectId,
				repositoryId: input.repositoryId,
				docPath: suggestion.docPath,
				baseDocSha: suggestion.baseDocSha,
				proposedContent: suggestion.proposedContent,
			});
			const existingEquivalent = (await tx.suggestion.findFirst({
				where: {
					projectId: input.projectId,
					repositoryId: input.repositoryId,
					docPath: suggestion.docPath,
					fingerprint,
				},
				orderBy: {
					createdAt: "desc",
				},
				select: {
					id: true,
					status: true,
				},
			})) as ExistingSuggestion | null;
			const skipReason = shouldSkipEquivalentSuggestion(
				existingEquivalent,
				input.decisionMemoryEnabled,
			);
			if (skipReason !== null) {
				skipped.push({
					docPath: suggestion.docPath,
					fingerprint,
					reason: skipReason,
				});
				continue;
			}

			const priorActiveSuggestions = await tx.suggestion.findMany({
				where: {
					projectId: input.projectId,
					repositoryId: input.repositoryId,
					docPath: suggestion.docPath,
					status: {
						in: ["pending", "accepted"],
					},
				},
				orderBy: {
					createdAt: "desc",
				},
				select: {
					id: true,
				},
			});
			const supersedesSuggestionId = priorActiveSuggestions[0]?.id ?? null;
			const created = await tx.suggestion.create({
				data: {
					projectId: input.projectId,
					repositoryId: input.repositoryId,
					runId: input.runId,
					docPath: suggestion.docPath,
					baseDocSha: suggestion.baseDocSha,
					beforeContent: suggestion.beforeContent,
					proposedContent: suggestion.proposedContent,
					reasoning: suggestion.reasoning,
					fingerprint,
					supersedesSuggestionId,
				},
				select: {
					id: true,
					docPath: true,
					fingerprint: true,
				},
			});
			if (priorActiveSuggestions.length > 0) {
				await tx.suggestion.updateMany({
					where: {
						id: {
							in: priorActiveSuggestions.map((candidate) => candidate.id),
						},
					},
					data: {
						status: "superseded",
					},
				});
			}
			persisted.push(created);
		}
		return { persisted, skipped };
	});

const resolveSuggestionRepositoryId = (input: {
	sourceRepository: RepositoryWithInstallation;
	docsLocation: RepoLocation;
	pipelineContext: PipelineContext;
}): string => {
	const docsTargetsSourceRepository =
		input.docsLocation.owner === input.pipelineContext.owner &&
		input.docsLocation.repo === input.pipelineContext.repo;
	if (docsTargetsSourceRepository) {
		return input.sourceRepository.id;
	}
	if (input.sourceRepository.docsRepositoryId !== null) {
		return input.sourceRepository.docsRepositoryId;
	}
	return input.sourceRepository.id;
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
		// Repository was deleted from the database after the job was enqueued.
		// Retrying will not restore it — fail immediately.
		throw new UnrecoverableError(
			`Repository '${payload.repositoryId}' was not found. It may have been removed.`,
		);
	}
	if (repository.provider !== PROVIDER_GITHUB) {
		// Unsupported provider is a configuration error that will not resolve on retry.
		throw new UnrecoverableError(`Unsupported repository provider '${repository.provider}'.`);
	}
	if (repository.installation.id !== payload.installationId) {
		// Mismatched installation ID means the job payload is stale or invalid.
		throw new UnrecoverableError("Job installationId does not match repository installation.");
	}
	if (repository.installation.status !== "active") {
		// Suspended or deleted installations require manual action to fix.
		// Retrying will not change the installation status.
		throw new UnrecoverableError(
			`Repository installation is not active (status: ${repository.installation.status}).`,
		);
	}
	const project = await db.project.findFirst({
		where: {
			OR: [
				{ sourceRepositoryId: payload.repositoryId },
				{ docsRepositoryId: payload.repositoryId },
			],
		},
		select: {
			id: true,
			config: true,
			sourceRepositoryId: true,
			docsRepositoryId: true,
		},
	});
	if (project === null) {
		throw new UnrecoverableError(`No project is linked to repository '${payload.repositoryId}'.`);
	}
	return {
		...repository,
		projectId: project.id,
		sourceRepositoryId: project.sourceRepositoryId,
		docsRepositoryId: project.docsRepositoryId,
		projectConfig: project.config,
	};
};

/**
 * Creates the analysis run record on the first attempt, or updates the existing
 * record on subsequent retry attempts. The unique constraint on
 * (projectId, repositoryId, triggerCommitSha, triggerType) guarantees exactly one run
 * per commit event, updated in-place across retries.
 */
const upsertInitialRun = async (
	job: Job<AnalyzeChangesJobPayload>,
	repository: RepositoryWithInstallation,
): Promise<string> => {
	const triggerMeta = {
		bullmq: {
			jobId: job.id ?? null,
			attemptNumber: job.attemptsMade + 1,
		},
	};
	const run = await db.analysisRun.upsert({
		where: {
			projectId_repositoryId_triggerCommitSha_triggerType: {
				projectId: repository.projectId,
				repositoryId: repository.id,
				triggerCommitSha: job.data.trigger.commitSha,
				triggerType: job.data.trigger.type,
			},
		},
		create: {
			projectId: repository.projectId,
			repositoryId: repository.id,
			provider: repository.provider,
			triggerType: job.data.trigger.type,
			triggerRef: job.data.trigger.ref,
			triggerCommitSha: job.data.trigger.commitSha,
			triggerMergeRequestNumber: job.data.trigger.prNumber ?? null,
			triggerPrTitle: job.data.trigger.prTitle ?? null,
			triggerSourceBranch: job.data.trigger.sourceBranch ?? null,
			triggerTargetBranch: job.data.trigger.targetBranch ?? null,
			triggerPrAuthorName: job.data.trigger.prAuthorName ?? null,
			triggerPrAuthorUsername: job.data.trigger.prAuthorUsername ?? null,
			triggerPrAuthorAvatarUrl: job.data.trigger.prAuthorAvatarUrl ?? null,
			triggerMeta,
			status: RUN_STATUS_RUNNING,
			startedAt: new Date(),
			attemptCount: job.attemptsMade + 1,
		},
		update: {
			// Reset transient state at the start of each retry attempt so stale
			// data from the previous attempt is not visible mid-run.
			status: RUN_STATUS_RUNNING,
			startedAt: new Date(),
			completedAt: null,
			error: null,
			docsAffected: null,
			docPrUrl: null,
			docPrNumber: null,
			tokenUsage: {},
			result: {},
			errorCode: null,
			errorMessage: null,
			suggestionsCount: 0,
			triggerPrTitle: job.data.trigger.prTitle ?? null,
			triggerSourceBranch: job.data.trigger.sourceBranch ?? null,
			triggerTargetBranch: job.data.trigger.targetBranch ?? null,
			triggerPrAuthorName: job.data.trigger.prAuthorName ?? null,
			triggerPrAuthorUsername: job.data.trigger.prAuthorUsername ?? null,
			triggerPrAuthorAvatarUrl: job.data.trigger.prAuthorAvatarUrl ?? null,
			attemptCount: job.attemptsMade + 1,
			triggerMeta,
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

const defaultOptions: AnalyzeChangesOptions = {
	autoPrEnabled: true,
	decisionMemoryEnabled: true,
};

export const processAnalyzeChangesJob = async (
	job: Job<AnalyzeChangesJobPayload>,
	logger: Logger,
	services: AnalyzeChangesServices = defaultServices,
	options: AnalyzeChangesOptions = defaultOptions,
): Promise<void> => {
	const jobLogger = logger.child({
		jobId: job.id ?? "unknown",
		attemptNumber: job.attemptsMade + 1,
		queue: job.queueName,
	});
	jobLogger.info({ payload: job.data }, "processing analyze changes job");
	if (job.data.trigger.type === "push") {
		jobLogger.info(
			{ repositoryId: job.data.repositoryId, triggerType: job.data.trigger.type },
			"skipping analyze-changes job for push trigger",
		);
		return;
	}

	const repository = await loadRepository(job.data);
	// Credential parsing must succeed before we create the run record. A failure
	// here is a deployment configuration error — retrying the job won't fix it,
	// and we should not produce a "failed" run entry for it.
	const credentials = parseCredentialsOrFail();
	const runId = await upsertInitialRun(job, repository);
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
				suggestionsCount: 0,
				result: {
					timingsMs: timings,
					reason: "No relevant code changes after default ignore-path filtering.",
				},
			});
			return;
		}

		const { value: synkAiFileConfig, durationMs: loadSynkAiFileConfigDurationMs } =
			await measureStep(jobLogger, runId, "load-synk-ai-config", async () =>
				readSynkAiConfigFromFile(octokit, context),
			);
		timings.loadSynkAiConfig = loadSynkAiFileConfigDurationMs;
		const { value: resolvedConfig, durationMs: resolveConfigDurationMs } = await measureStep(
			jobLogger,
			runId,
			"resolve-docs-config",
			async () => resolveDocsConfig(repository, synkAiFileConfig),
		);
		timings.resolveDocsConfig = resolveConfigDurationMs;
		const { value: prConfig, durationMs: resolvePrConfigDurationMs } = await measureStep(
			jobLogger,
			runId,
			"resolve-pr-config",
			async () => resolvePrConfig(repository, synkAiFileConfig),
		);
		timings.resolvePrConfig = resolvePrConfigDurationMs;
		const filteredDiffWithProjectIgnores = filterDiff(filteredDiff, resolvedConfig.ignorePaths);
		if (filteredDiffWithProjectIgnores.length === 0) {
			await updateRunStatus(runId, RUN_STATUS_SKIPPED, {
				docsAffected: false,
				suggestionsCount: 0,
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
			repository.projectId,
			docsConfig,
			resolvedConfig.ignorePaths,
			repository.projectConfig,
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
				suggestionsCount: 0,
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

		const meaningfulChanges: SuggestionDraft[] = [];
		for (const output of generationOutputs) {
			const currentFile = docFileByPath.get(output.path);
			if (currentFile === undefined) {
				continue;
			}
			if (currentFile.content === output.content) {
				continue;
			}
			const baseDocSha = docData.docShaByPath.get(output.path);
			if (baseDocSha === undefined) {
				jobLogger.warn(
					{ runId, docPath: output.path },
					"skipping suggestion because base document SHA is unavailable",
				);
				continue;
			}
			meaningfulChanges.push({
				docPath: output.path,
				baseDocSha,
				beforeContent: currentFile.content,
				proposedContent: output.content,
				reasoning: output.reasoning,
			});
		}
		if (meaningfulChanges.length === 0) {
			await updateRunStatus(runId, RUN_STATUS_COMPLETED, {
				docsAffected: false,
				suggestionsCount: 0,
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

		const runResultBase = {
			timingsMs: timings,
			triage: triageResult,
			generation: generationOutputs.map((output) => ({
				path: output.path,
				reasoning: output.reasoning,
			})),
		};

		if (!options.autoPrEnabled) {
			const suggestionRepositoryId = resolveSuggestionRepositoryId({
				sourceRepository: repository,
				docsLocation,
				pipelineContext: context,
			});
			const { value: suggestionPersistence, durationMs: persistSuggestionsDurationMs } =
				await measureStep(jobLogger, runId, "persist-suggestions", async () =>
					persistSuggestions({
						projectId: repository.projectId,
						repositoryId: suggestionRepositoryId,
						runId,
						suggestions: meaningfulChanges,
						decisionMemoryEnabled: options.decisionMemoryEnabled,
					}),
				);
			timings.persistSuggestions = persistSuggestionsDurationMs;

			await updateRunStatus(runId, RUN_STATUS_COMPLETED, {
				docsAffected: true,
				suggestionsCount: suggestionPersistence.persisted.length,
				tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
				result: {
					...runResultBase,
					suggestions: suggestionPersistence.persisted.map((suggestion) => ({
						id: suggestion.id,
						path: suggestion.docPath,
						fingerprint: suggestion.fingerprint,
					})),
					skippedSuggestions: suggestionPersistence.skipped,
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
					files: meaningfulChanges.map((change) => ({
						path: change.docPath,
						content: change.proposedContent,
						reasoning: change.reasoning,
					})),
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
			suggestionsCount: meaningfulChanges.length,
			tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
			result: runResultBase,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown analyze-changes failure";
		const classification = classifyError(error);
		const errorCode = resolveErrorCode(error, classification);
		const maxAttempts = job.opts.attempts ?? 1;
		const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

		const logContext = {
			err: error,
			runId,
			classification,
			isFinalAttempt,
			repositoryId: job.data.repositoryId,
			attemptNumber: job.attemptsMade + 1,
		};

		// Alert at error level only when the failure is permanent: either the
		// error is non-retryable (misconfiguration, missing resource) or all
		// attempts have been exhausted. Transient retryable failures log at warn
		// to avoid spurious on-call pages.
		if (classification === "non-retryable" || isFinalAttempt) {
			jobLogger.error(logContext, "analyze-changes pipeline failed permanently");
		} else {
			jobLogger.warn(logContext, "analyze-changes pipeline failed, will be retried");
		}

		try {
			await updateRunStatus(runId, RUN_STATUS_FAILED, {
				errorCode,
				errorMessage,
				suggestionsCount: 0,
				tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
				result: {
					timingsMs: timings,
				},
			});
		} catch {
			// Swallow status-update failures so the original pipeline error always
			// propagates to BullMQ for correct retry tracking.
		}

		// Non-retryable errors (auth revoked, resource permanently gone, invalid
		// payload) must not be retried. Wrapping in UnrecoverableError signals
		// BullMQ to skip the remaining retry attempts and move the job to the DLQ.
		if (classification === "non-retryable") {
			throw new UnrecoverableError(errorMessage);
		}
		throw error;
	}
};
