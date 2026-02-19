export interface RepoTreeFile {
	path: string;
	sha: string;
	size: number | null;
}

export interface RepoFileContent {
	path: string;
	sha: string;
	size: number;
	content: string;
}

export interface FetchRepoTreeRequest {
	owner: string;
	repo: string;
	ref: string;
}

export interface FetchFileContentRequest {
	owner: string;
	repo: string;
	path: string;
	ref: string;
}

export interface FetchMultipleFilesRequest {
	owner: string;
	repo: string;
	paths: readonly string[];
	ref: string;
}

export class GitHubRepositoryContentError extends Error {
	readonly code:
		| "path-is-directory"
		| "missing-content"
		| "missing-blob-sha"
		| "unsupported-encoding";

	constructor(
		code: "path-is-directory" | "missing-content" | "missing-blob-sha" | "unsupported-encoding",
		message: string,
	) {
		super(message);
		this.name = "GitHubRepositoryContentError";
		this.code = code;
	}
}

export class GitHubRepositoryTreeError extends Error {
	readonly code: "truncated-tree";

	constructor(code: "truncated-tree", message: string) {
		super(message);
		this.name = "GitHubRepositoryTreeError";
		this.code = code;
	}
}

interface GitHubRateLimitHeaders {
	"x-ratelimit-remaining"?: string;
	"x-ratelimit-reset"?: string;
}

interface GitHubTreeEntry {
	path?: string;
	type?: string;
	sha?: string;
	size?: number;
}

interface GitHubContentFile {
	type: string;
	path: string;
	sha: string;
	size: number;
	encoding?: string;
	content?: string;
}

interface GitHubDirectoryEntry {
	type: string;
	path: string;
}

interface GitHubRepositoryTreeOctokit {
	rest: {
		git: {
			getTree(params: {
				owner: string;
				repo: string;
				tree_sha: string;
				recursive: "1";
			}): Promise<{
				data: { tree?: readonly GitHubTreeEntry[]; truncated?: boolean };
				headers: GitHubRateLimitHeaders;
			}>;
			getBlob(params: {
				owner: string;
				repo: string;
				file_sha: string;
			}): Promise<{
				data: { content?: string; encoding?: string };
				headers: GitHubRateLimitHeaders;
			}>;
		};
		repos: {
			getContent(params: {
				owner: string;
				repo: string;
				path: string;
				ref: string;
			}): Promise<{
				data: GitHubContentFile | readonly GitHubDirectoryEntry[];
				headers: GitHubRateLimitHeaders;
			}>;
		};
	};
}

const LARGE_FILE_THRESHOLD_BYTES = 1_000_000;
const RATE_LIMIT_BACKOFF_THRESHOLD = 1;
const RATE_LIMIT_BACKOFF_BUFFER_MS = 250;

const parseInteger = (value: string | undefined): number | null => {
	if (value === undefined) {
		return null;
	}

	const parsedValue = Number.parseInt(value, 10);
	return Number.isInteger(parsedValue) ? parsedValue : null;
};

const sleep = async (milliseconds: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});

const backoffIfRateLimitLow = async (headers: GitHubRateLimitHeaders): Promise<void> => {
	const remaining = parseInteger(headers["x-ratelimit-remaining"]);
	if (remaining === null || remaining > RATE_LIMIT_BACKOFF_THRESHOLD) {
		return;
	}

	const resetEpochSeconds = parseInteger(headers["x-ratelimit-reset"]);
	if (resetEpochSeconds === null) {
		return;
	}

	const waitMilliseconds = Math.max(resetEpochSeconds * 1000 - Date.now(), 0);
	if (waitMilliseconds === 0) {
		return;
	}

	await sleep(waitMilliseconds + RATE_LIMIT_BACKOFF_BUFFER_MS);
};

const decodeBase64Content = (
	content: string,
	encoding: string | undefined,
	path: string,
): string => {
	if (encoding !== "base64") {
		throw new GitHubRepositoryContentError(
			"unsupported-encoding",
			`Unsupported encoding '${encoding ?? "unknown"}' for file '${path}'.`,
		);
	}

	return Buffer.from(content.replace(/\n/gu, ""), "base64").toString("utf8");
};

const isBlobFallbackRequired = (file: GitHubContentFile): boolean =>
	file.size > LARGE_FILE_THRESHOLD_BYTES || file.content === undefined || file.content.length === 0;

const isDirectoryListing = (
	data: GitHubContentFile | readonly GitHubDirectoryEntry[],
): data is readonly GitHubDirectoryEntry[] => Array.isArray(data);

const ensureFileContent = (
	data: GitHubContentFile | readonly GitHubDirectoryEntry[],
	path: string,
): GitHubContentFile => {
	if (isDirectoryListing(data)) {
		throw new GitHubRepositoryContentError(
			"path-is-directory",
			`Path '${path}' points to a directory and cannot be fetched as a file.`,
		);
	}

	return data;
};

const resolveFetchRepoTreeArgs = (
	args:
		| readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchRepoTreeRequest]
		| readonly [octokit: GitHubRepositoryTreeOctokit, owner: string, repo: string, ref: string],
): readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchRepoTreeRequest] => {
	if (args.length === 2) {
		return [args[0], args[1]];
	}

	return [
		args[0],
		{
			owner: args[1],
			repo: args[2],
			ref: args[3],
		},
	];
};

const resolveFetchFileContentArgs = (
	args:
		| readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchFileContentRequest]
		| readonly [
				octokit: GitHubRepositoryTreeOctokit,
				owner: string,
				repo: string,
				path: string,
				ref: string,
		  ],
): readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchFileContentRequest] => {
	if (args.length === 2) {
		return [args[0], args[1]];
	}

	return [
		args[0],
		{
			owner: args[1],
			repo: args[2],
			path: args[3],
			ref: args[4],
		},
	];
};

const resolveFetchMultipleFilesArgs = (
	args:
		| readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchMultipleFilesRequest]
		| readonly [
				octokit: GitHubRepositoryTreeOctokit,
				owner: string,
				repo: string,
				paths: readonly string[],
				ref: string,
		  ],
): readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchMultipleFilesRequest] => {
	if (args.length === 2) {
		return [args[0], args[1]];
	}

	return [
		args[0],
		{
			owner: args[1],
			repo: args[2],
			paths: args[3],
			ref: args[4],
		},
	];
};

export const fetchRepoTree = async (
	...args:
		| readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchRepoTreeRequest]
		| readonly [octokit: GitHubRepositoryTreeOctokit, owner: string, repo: string, ref: string]
): Promise<RepoTreeFile[]> => {
	const [octokit, request] = resolveFetchRepoTreeArgs(args);
	const response = await octokit.rest.git.getTree({
		owner: request.owner,
		repo: request.repo,
		tree_sha: request.ref,
		recursive: "1",
	});

	await backoffIfRateLimitLow(response.headers);

	if (response.data.truncated === true) {
		throw new GitHubRepositoryTreeError(
			"truncated-tree",
			`GitHub tree response was truncated for '${request.owner}/${request.repo}' at ref '${request.ref}'.`,
		);
	}

	return (response.data.tree ?? [])
		.filter((entry): entry is Required<Pick<GitHubTreeEntry, "path" | "sha">> & GitHubTreeEntry => {
			return entry.type === "blob" && entry.path !== undefined && entry.sha !== undefined;
		})
		.map((entry) => ({
			path: entry.path,
			sha: entry.sha,
			size: typeof entry.size === "number" ? entry.size : null,
		}));
};

export const fetchFileContent = async (
	...args:
		| readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchFileContentRequest]
		| readonly [
				octokit: GitHubRepositoryTreeOctokit,
				owner: string,
				repo: string,
				path: string,
				ref: string,
		  ]
): Promise<RepoFileContent> => {
	const [octokit, request] = resolveFetchFileContentArgs(args);
	const response = await octokit.rest.repos.getContent({
		owner: request.owner,
		repo: request.repo,
		path: request.path,
		ref: request.ref,
	});

	await backoffIfRateLimitLow(response.headers);

	const contentData = ensureFileContent(response.data, request.path);

	if (!isBlobFallbackRequired(contentData)) {
		const fileContent = contentData.content;
		if (fileContent === undefined || fileContent.length === 0) {
			throw new GitHubRepositoryContentError(
				"missing-content",
				`GitHub contents response for '${request.path}' did not include file content.`,
			);
		}

		return {
			path: contentData.path,
			sha: contentData.sha,
			size: contentData.size,
			content: decodeBase64Content(fileContent, contentData.encoding, contentData.path),
		};
	}

	if (contentData.sha.length === 0) {
		throw new GitHubRepositoryContentError(
			"missing-blob-sha",
			`Unable to fetch blob fallback for '${request.path}' because sha is missing.`,
		);
	}

	const blobResponse = await octokit.rest.git.getBlob({
		owner: request.owner,
		repo: request.repo,
		file_sha: contentData.sha,
	});

	await backoffIfRateLimitLow(blobResponse.headers);

	if (blobResponse.data.content === undefined || blobResponse.data.content.length === 0) {
		throw new GitHubRepositoryContentError(
			"missing-content",
			`GitHub blob response for '${request.path}' did not include file content.`,
		);
	}

	return {
		path: contentData.path,
		sha: contentData.sha,
		size: contentData.size,
		content: decodeBase64Content(
			blobResponse.data.content,
			blobResponse.data.encoding,
			request.path,
		),
	};
};

export const fetchMultipleFiles = async (
	...args:
		| readonly [octokit: GitHubRepositoryTreeOctokit, request: FetchMultipleFilesRequest]
		| readonly [
				octokit: GitHubRepositoryTreeOctokit,
				owner: string,
				repo: string,
				paths: readonly string[],
				ref: string,
		  ]
): Promise<RepoFileContent[]> => {
	const [octokit, request] = resolveFetchMultipleFilesArgs(args);
	const files: RepoFileContent[] = [];

	for (const path of request.paths) {
		const file = await fetchFileContent(octokit, {
			owner: request.owner,
			repo: request.repo,
			path,
			ref: request.ref,
		});
		files.push(file);
	}

	return files;
};
