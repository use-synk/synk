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
import type { AnalyzeChangesJobPayload } from "@synk-ai/shared";
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
};

type TokenUsage = {
	prompt: number;
	completion: number;
	total: number;
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

type ResolvedDocsConfig = {
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
		files: readonly { path: string; content: string }[];
		trigger: AnalyzeChangesJobPayload["trigger"];
	}) => Promise<PullRequestResult>;
};

const normalizeTokenUsage = (value: Partial<TokenUsage> | undefined): TokenUsage => {
	const prompt = value?.prompt ?? 0;
	const completion = value?.completion ?? 0;
	return {
		prompt,
		completion,
		total: value?.total ?? prompt + completion,
	};
};

const aggregateTokenUsage = (
	triageUsage: TokenUsage,
	generationUsage: readonly TokenUsage[],
): Record<string, unknown> => {
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

const parseOwnerAndRepo = (fullName: string): { owner: string; repo: string } => {
	const [owner, repo] = fullName.split("/");
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0) {
		throw new Error(`Invalid repository fullName '${fullName}'. Expected owner/repo.`);
	}
	return { owner, repo };
};

const parseInstallationId = (providerInstallationId: string): number => {
	const installationId = Number.parseInt(providerInstallationId, 10);
	if (!Number.isInteger(installationId) || installationId <= 0) {
		throw new Error(
			`Invalid providerInstallationId '${providerInstallationId}'. Expected positive integer.`,
		);
	}
	return installationId;
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

const parseDocsConfigFromObject = (value: unknown): ResolvedDocsConfig | null => {
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

const parseFramework = (framework: string | undefined): DocsConfig["framework"] => {
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

const parseSynkAiYaml = (content: string): ResolvedDocsConfig | null => {
	const docs: DocsConfig = {};
	const ignorePaths: string[] = [];
	let topLevelSection: string | undefined;
	let inIgnorePaths = false;

	for (const rawLine of content.split("\n")) {
		const line = rawLine.replace(/\t/gu, "  ");
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}

		const indent = line.length - line.trimStart().length;
		if (indent === 0 && trimmed.endsWith(":")) {
			topLevelSection = trimmed.slice(0, -1);
			inIgnorePaths = false;
			continue;
		}

		if (topLevelSection === "docs" && indent >= 2) {
			const match = trimmed.match(/^(framework|path|repo|branch):\s*(.+)$/u);
			if (match) {
				const key = match[1];
				const rawValue = match[2]?.replace(/^["']|["']$/gu, "");
				const value = parseStringValue(rawValue);
				if (key === "framework") {
					const parsedFramework = parseFramework(value);
					if (parsedFramework !== undefined) {
						docs.framework = parsedFramework;
					}
				}
				if (key === "path") {
					if (value !== undefined) {
						docs.path = value;
					}
				}
				if (key === "repo") {
					if (value !== undefined) {
						docs.repo = value;
					}
				}
				if (key === "branch") {
					if (value !== undefined) {
						docs.branch = value;
					}
				}
			}
			continue;
		}

		if (topLevelSection === "triggers" && indent >= 2) {
			if (trimmed === "ignore_paths:") {
				inIgnorePaths = true;
				continue;
			}
			if (inIgnorePaths && trimmed.startsWith("- ")) {
				const value = trimmed
					.slice(2)
					.trim()
					.replace(/^["']|["']$/gu, "");
				if (value.length > 0) {
					ignorePaths.push(value);
				}
				continue;
			}
			if (!trimmed.startsWith("- ")) {
				inIgnorePaths = false;
			}
		}
	}

	return {
		docs,
		ignorePaths,
	};
};

const fileMatchesGlob = (path: string, globPatterns: readonly string[]): boolean => {
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
	const fromDatabase = parseDocsConfigFromObject(repository.docsConfig);
	if (fromDatabase !== null && hasConfiguredDocsValue(fromDatabase.docs)) {
		return fromDatabase;
	}

	try {
		const configFile = await fetchFileContent(octokit, {
			owner: context.owner,
			repo: context.repo,
			path: ".synk-ai.yml",
			ref: context.commitSha,
		});
		const fromFile = parseSynkAiYaml(configFile.content);
		if (fromFile !== null && hasConfiguredDocsValue(fromFile.docs)) {
			return fromFile;
		}
	} catch {
		// Missing config file is expected for many repositories.
	}

	return { docs: {}, ignorePaths: [] };
};

const hasConfiguredDocsValue = (docs: DocsConfig): boolean =>
	docs.framework !== undefined ||
	docs.path !== undefined ||
	docs.repo !== undefined ||
	docs.branch !== undefined;

const resolveAdapter = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	context: PipelineContext,
	docsConfig: DocsConfig,
): Promise<{ adapter: DocAdapter; sourceTree: readonly RepoTreeFile[] }> => {
	const sourceTree = await fetchRepoTree(octokit, {
		owner: context.owner,
		repo: context.repo,
		ref: context.commitSha,
	});
	if (docsConfig.framework !== undefined && docsConfig.framework !== "auto") {
		return { adapter: getAdapter(docsConfig.framework), sourceTree };
	}

	const packageJsonContent = await readPackageJsonContent(octokit, context);
	const repoFiles: RepoFile[] = sourceTree.map((file) => ({
		path: file.path,
		sha: file.sha,
		size: file.size,
	}));
	const adapter = await detectAdapter(
		repoFiles,
		packageJsonContent === undefined ? undefined : { packageJson: packageJsonContent },
	);
	return { adapter, sourceTree };
};

const readPackageJsonContent = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	context: PipelineContext,
): Promise<string | undefined> => {
	try {
		const packageJson = await fetchFileContent(octokit, {
			owner: context.owner,
			repo: context.repo,
			path: "package.json",
			ref: context.commitSha,
		});
		return packageJson.content;
	} catch {
		return undefined;
	}
};

const resolveDocsLocation = (
	repositoryFullName: string,
	defaultBranch: string,
	docsConfig: DocsConfig,
): { owner: string; repo: string; ref: string } => {
	const configuredRepo = docsConfig.repo ?? repositoryFullName;
	const { owner, repo } = parseOwnerAndRepo(configuredRepo);
	return {
		owner,
		repo,
		ref: docsConfig.branch ?? defaultBranch,
	};
};

const collectDocFiles = async (
	octokit: ReturnType<typeof createInstallationOctokit>,
	adapter: DocAdapter,
	docsConfig: DocsConfig,
	location: { owner: string; repo: string; ref: string },
): Promise<{ tree: readonly RepoTreeFile[]; docFiles: readonly DocFile[] }> => {
	const tree = await fetchRepoTree(octokit, {
		owner: location.owner,
		repo: location.repo,
		ref: location.ref,
	});
	const globs = adapter.getDocPaths(docsConfig);
	const docPaths = tree
		.map((entry) => entry.path)
		.filter((path) => fileMatchesGlob(path, globs))
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

const updateRunStatus = async (
	runId: string,
	status: "running" | "completed" | "skipped" | "failed",
	data: {
		error?: string;
		docsAffected?: boolean;
		docPrUrl?: string;
		docPrNumber?: number;
		tokenUsage?: Record<string, unknown>;
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

const defaultCreatePullRequest: AnalyzeChangesServices["createPullRequest"] = async () => {
	throw new Error(
		"PR creation service is not wired yet. Implement issue 5.2 and inject createPullRequest.",
	);
};

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

const services: AnalyzeChangesServices = {
	runTriage: defaultRunTriage,
	runGeneration: defaultRunGeneration,
	createPullRequest: defaultCreatePullRequest,
};

export const processAnalyzeChangesJob = async (
	job: Job<AnalyzeChangesJobPayload>,
	logger: Logger,
): Promise<void> => {
	const jobLogger = logger.child({
		jobId: job.id ?? "unknown",
		attemptNumber: job.attemptsMade + 1,
		queue: job.queueName,
	});
	jobLogger.info({ payload: job.data }, "processing analyze changes job");

	const repository = await loadRepository(job.data);
	const runId = await createInitialRun(job, repository);
	const timings: Record<string, number> = {};
	let triageUsage = normalizeTokenUsage(undefined);
	const generationUsage: TokenUsage[] = [];

	try {
		const context = buildPipelineContext(repository, job.data.trigger);
		const credentials = credentialsFromEnvironment(parseGitHubCredentialsEnvironment());
		const installationId = parseInstallationId(repository.installation.providerInstallationId);
		const { value: octokit, durationMs: stepOneDuration } = await measureStep(
			jobLogger,
			runId,
			"create-installation-octokit",
			async () => createInstallationOctokit(installationId, credentials),
		);
		timings.createInstallationOctokit = stepOneDuration;

		const { value: rawDiff, durationMs: stepTwoDuration } = await measureStep(
			jobLogger,
			runId,
			"fetch-diff",
			async () => fetchDiffForTrigger(octokit, context, job.data.trigger),
		);
		timings.fetchDiff = stepTwoDuration;

		const { value: filteredDiff, durationMs: stepThreeDuration } = await measureStep(
			jobLogger,
			runId,
			"filter-diff",
			async () => filterDiff(rawDiff),
		);
		timings.filterDiff = stepThreeDuration;
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

		const { value: resolvedConfig, durationMs: stepFiveDuration } = await measureStep(
			jobLogger,
			runId,
			"resolve-docs-config",
			async () => resolveDocsConfig(octokit, context, repository),
		);
		timings.resolveDocsConfig = stepFiveDuration;
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

		const { value: adapterResolution, durationMs: detectAdapterDuration } = await measureStep(
			jobLogger,
			runId,
			"detect-doc-adapter",
			async () => resolveAdapter(octokit, context, resolvedConfig.docs),
		);
		timings.detectDocAdapter = detectAdapterDuration;
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
		const docsLocation = resolveDocsLocation(
			repository.fullName,
			repository.defaultBranch,
			docsConfig,
		);

		const { value: docData, durationMs: stepSixDuration } = await measureStep(
			jobLogger,
			runId,
			"fetch-doc-tree-and-files",
			async () => collectDocFiles(octokit, adapterResolution.adapter, docsConfig, docsLocation),
		);
		timings.fetchDocTreeAndFiles = stepSixDuration;

		const docTree = adapterResolution.adapter.parseStructure([...docData.docFiles]);
		const { value: triageResult, durationMs: stepSevenDuration } = await measureStep(
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
		timings.runAiTriage = stepSevenDuration;
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

		const meaningfulChanges = generationOutputs
			.map((output) => {
				const currentFile = docFileByPath.get(output.path);
				if (currentFile === undefined) {
					return null;
				}
				if (currentFile.content === output.content) {
					return null;
				}
				return { path: output.path, content: output.content };
			})
			.filter((entry): entry is { path: string; content: string } => entry !== null);
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

		const { value: prResult, durationMs: stepElevenDuration } = await measureStep(
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
					trigger: job.data.trigger,
				}),
		);
		timings.createPr = stepElevenDuration;

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
		await updateRunStatus(runId, RUN_STATUS_FAILED, {
			error: errorMessage,
			tokenUsage: aggregateTokenUsage(triageUsage, generationUsage),
			result: {
				timingsMs: timings,
			},
		});
		throw error;
	}
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
