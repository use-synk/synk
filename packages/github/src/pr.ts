export interface DocUpdateFile {
	path: string;
	content: string;
	reasoning?: string;
}

export interface DocUpdatePrConfig {
	labels?: readonly string[];
	assignees?: readonly string[];
	reviewers?: readonly string[];
	draft?: boolean;
}

export interface DocUpdateTriggerInfo {
	type: "push" | "merge";
	ref: string;
	commitSha: string;
	prNumber?: number;
	prTitle?: string;
	sourceOwner?: string;
	sourceRepo?: string;
}

export interface CreateDocUpdatePrRequest {
	owner: string;
	repo: string;
	baseBranch: string;
	files: readonly DocUpdateFile[];
	triggerInfo: DocUpdateTriggerInfo;
	config?: DocUpdatePrConfig;
}

export interface CreateDocUpdatePrResult {
	prNumber: number;
	prUrl: string;
	branchName: string;
}

interface GitHubPrServiceOctokit {
	rest: {
		git: {
			getRef(params: { owner: string; repo: string; ref: string }): Promise<{
				data: { object: { sha: string } };
			}>;
			getCommit(params: { owner: string; repo: string; commit_sha: string }): Promise<{
				data: { tree: { sha: string } };
			}>;
			createTree(params: {
				owner: string;
				repo: string;
				base_tree?: string;
				tree: { path: string; mode: "100644"; type: "blob"; content: string }[];
			}): Promise<{ data: { sha: string } }>;
			createCommit(params: {
				owner: string;
				repo: string;
				message: string;
				tree: string;
				parents: string[];
			}): Promise<{ data: { sha: string } }>;
			createRef(params: { owner: string; repo: string; ref: string; sha: string }): Promise<unknown>;
		};
		pulls: {
			create(params: {
				owner: string;
				repo: string;
				title: string;
				head: string;
				base: string;
				body: string;
				draft: boolean;
			}): Promise<{ data: { number: number; html_url: string } }>;
			requestReviewers(params: {
				owner: string;
				repo: string;
				pull_number: number;
				reviewers: string[];
			}): Promise<unknown>;
		};
		issues: {
			addLabels(params: {
				owner: string;
				repo: string;
				issue_number: number;
				labels: string[];
			}): Promise<unknown>;
			addAssignees(params: {
				owner: string;
				repo: string;
				issue_number: number;
				assignees: string[];
			}): Promise<unknown>;
		};
	};
}

const DEFAULT_LABELS = ["synk-ai", "documentation"] as const;
const TITLE_PREFIX = "docs: update documentation for ";
const MAX_PR_TITLE_LENGTH = 72;

const timestampForBranch = (date: Date): string =>
	date.toISOString().replace(/[-:.]/gu, "").replace("T", "-").slice(0, 15);

const withLengthLimit = (input: string, maxLength: number): string => {
	if (input.length <= maxLength) {
		return input;
	}
	if (maxLength <= 3) {
		return input.slice(0, maxLength);
	}
	return `${input.slice(0, maxLength - 3)}...`;
};

const summarizeFiles = (files: readonly DocUpdateFile[]): string => {
	if (files.length === 1) {
		return files[0]?.path ?? "updated docs";
	}
	const firstPath = files[0]?.path;
	if (firstPath === undefined) {
		return "updated docs";
	}
	if (files.length === 2) {
		const secondPath = files[1]?.path ?? "another file";
		return `${firstPath} and ${secondPath}`;
	}
	return `${firstPath} and ${files.length - 1} more files`;
};

const buildPullRequestTitle = (files: readonly DocUpdateFile[]): string => {
	const maxSummaryLength = Math.max(MAX_PR_TITLE_LENGTH - TITLE_PREFIX.length, 0);
	const summary = withLengthLimit(summarizeFiles(files), maxSummaryLength);
	return `${TITLE_PREFIX}${summary}`;
};

const buildTriggeredBySection = (
	owner: string,
	repo: string,
	triggerInfo: DocUpdateTriggerInfo,
): string => {
	const sourceOwner = triggerInfo.sourceOwner ?? owner;
	const sourceRepo = triggerInfo.sourceRepo ?? repo;
	const commitUrl = `https://github.com/${sourceOwner}/${sourceRepo}/commit/${triggerInfo.commitSha}`;
	if (triggerInfo.type === "merge" && triggerInfo.prNumber !== undefined) {
		const pullUrl = `https://github.com/${sourceOwner}/${sourceRepo}/pull/${triggerInfo.prNumber}`;
		return `[PR #${triggerInfo.prNumber}](${pullUrl}) (commit: [${triggerInfo.commitSha.slice(0, 12)}](${commitUrl}))`;
	}
	return `[commit ${triggerInfo.commitSha.slice(0, 12)}](${commitUrl})`;
};

const buildPullRequestBody = (request: CreateDocUpdatePrRequest): string => {
	const sourceOwner = request.triggerInfo.sourceOwner ?? request.owner;
	const sourceRepo = request.triggerInfo.sourceRepo ?? request.repo;
	const sourceIsSeparateRepo = sourceOwner !== request.owner || sourceRepo !== request.repo;
	const fileReasoning = request.files
		.map(
			(file) =>
				`- \`${file.path}\`: ${file.reasoning ?? "Updated by synk ai based on recent code changes."}`,
		)
		.join("\n");
	const updatedFiles = request.files.map((file) => `- \`${file.path}\``).join("\n");
	const sourceCommitLine = sourceIsSeparateRepo
		? `\n\nSource commit: https://github.com/${sourceOwner}/${sourceRepo}/commit/${request.triggerInfo.commitSha}`
		: "";
	return `## What changed
${fileReasoning}

## Triggered by
${buildTriggeredBySection(request.owner, request.repo, request.triggerInfo)}${sourceCommitLine}

## Files updated
${updatedFiles}

---
*This PR was automatically generated by [synk ai](https://synk-ai.dev). Review carefully before merging.*`;
};

const buildBranchName = (triggerSha: string, now: Date): string => {
	const shortSha = triggerSha.slice(0, 7);
	return `synk-ai/docs-${shortSha}-${timestampForBranch(now)}`;
};

const isBranchAlreadyExistsError = (error: unknown): boolean => {
	if (typeof error !== "object" || error === null || !("status" in error)) {
		return false;
	}
	if (error.status !== 422) {
		return false;
	}
	const messages: string[] = [];
	if ("message" in error && typeof error.message === "string") {
		messages.push(error.message);
	}
	if ("response" in error && typeof error.response === "object" && error.response !== null) {
		const response = error.response as Record<string, unknown>;
		if ("data" in response && typeof response.data === "object" && response.data !== null) {
			const data = response.data as Record<string, unknown>;
			if (typeof data.message === "string") {
				messages.push(data.message);
			}
			if (Array.isArray(data.errors)) {
				for (const entry of data.errors) {
					if (typeof entry === "object" && entry !== null) {
						const errorEntry = entry as Record<string, unknown>;
						if (typeof errorEntry.message === "string") {
							messages.push(errorEntry.message);
						}
						if (typeof errorEntry.code === "string") {
							messages.push(errorEntry.code);
						}
					}
				}
			}
		}
	}
	const combinedMessage = messages.join(" ").toLowerCase();
	return combinedMessage.includes("reference already exists");
};

const createBranchReference = async (
	octokit: GitHubPrServiceOctokit,
	owner: string,
	repo: string,
	commitSha: string,
	baseBranchName: string,
): Promise<string> => {
	const maxAttempts = 5;
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		const branchName = attempt === 0 ? baseBranchName : `${baseBranchName}-${attempt + 1}`;
		try {
			await octokit.rest.git.createRef({
				owner,
				repo,
				ref: `refs/heads/${branchName}`,
				sha: commitSha,
			});
			return branchName;
		} catch (error) {
			if (!isBranchAlreadyExistsError(error) || attempt === maxAttempts - 1) {
				throw error;
			}
		}
	}
	throw new Error("Unable to create PR branch reference.");
};

const sanitizeUnique = (values: readonly string[] | undefined): string[] =>
	(values ?? []).map((value) => value.trim()).filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);

const buildCommitMessage = (files: readonly DocUpdateFile[]): string =>
	`docs: update ${summarizeFiles(files)}`;

const validateFiles = (files: readonly DocUpdateFile[]): void => {
	if (files.length === 0) {
		throw new Error("createDocUpdatePR requires at least one file update.");
	}
};

export const createDocUpdatePR = async (
	octokit: GitHubPrServiceOctokit,
	request: CreateDocUpdatePrRequest,
): Promise<CreateDocUpdatePrResult> => {
	validateFiles(request.files);

	const baseBranchName = buildBranchName(request.triggerInfo.commitSha, new Date());
	const baseReference = await octokit.rest.git.getRef({
		owner: request.owner,
		repo: request.repo,
		ref: `heads/${request.baseBranch}`,
	});
	const baseCommitSha = baseReference.data.object.sha;
	const baseCommit = await octokit.rest.git.getCommit({
		owner: request.owner,
		repo: request.repo,
		commit_sha: baseCommitSha,
	});

	const tree = await octokit.rest.git.createTree({
		owner: request.owner,
		repo: request.repo,
		base_tree: baseCommit.data.tree.sha,
		tree: request.files.map((file) => ({
			path: file.path,
			mode: "100644",
			type: "blob",
			content: file.content,
		})),
	});
	const commit = await octokit.rest.git.createCommit({
		owner: request.owner,
		repo: request.repo,
		message: buildCommitMessage(request.files),
		tree: tree.data.sha,
		parents: [baseCommitSha],
	});
	const branchName = await createBranchReference(
		octokit,
		request.owner,
		request.repo,
		commit.data.sha,
		baseBranchName,
	);

	const title = buildPullRequestTitle(request.files);
	const pullRequest = await octokit.rest.pulls.create({
		owner: request.owner,
		repo: request.repo,
		title,
		head: branchName,
		base: request.baseBranch,
		body: buildPullRequestBody(request),
		draft: request.config?.draft ?? false,
	});
	const prNumber = pullRequest.data.number;
	const labels = sanitizeUnique(request.config?.labels ?? DEFAULT_LABELS);
	if (labels.length > 0) {
		await octokit.rest.issues.addLabels({
			owner: request.owner,
			repo: request.repo,
			issue_number: prNumber,
			labels,
		});
	}

	const assignees = sanitizeUnique(request.config?.assignees);
	if (assignees.length > 0) {
		await octokit.rest.issues.addAssignees({
			owner: request.owner,
			repo: request.repo,
			issue_number: prNumber,
			assignees,
		});
	}

	const reviewers = sanitizeUnique(request.config?.reviewers);
	if (reviewers.length > 0) {
		await octokit.rest.pulls.requestReviewers({
			owner: request.owner,
			repo: request.repo,
			pull_number: prNumber,
			reviewers,
		});
	}

	return {
		prNumber,
		prUrl: pullRequest.data.html_url,
		branchName,
	};
};
