import { describe, expect, it, mock, jest, setSystemTime } from "bun:test";

import {
	GitHubRepositoryContentError,
	GitHubRepositoryTreeError,
	fetchFileContent,
	fetchMultipleFiles,
	fetchRepoTree,
} from "../tree";

describe("fetchRepoTree", () => {
	it("fetches a recursive tree and returns only file entries", async () => {
		const getTree = mock(async () => ({
			data: {
				tree: [
					{ path: "docs", type: "tree", sha: "sha-docs" },
					{ path: "README.md", type: "blob", sha: "sha-readme", size: 120 },
					{ path: "docs/guide.md", type: "blob", sha: "sha-guide", size: 220 },
				],
			},
			headers: {},
		}));

		const octokit = {
			rest: {
				git: {
					getTree,
					getBlob: mock(),
				},
				repos: {
					getContent: mock(),
				},
			},
		};

		const files = await fetchRepoTree(octokit, "synk", "synk-ai", "main");

		expect(getTree).toHaveBeenCalledWith({
			owner: "synk",
			repo: "synk-ai",
			tree_sha: "main",
			recursive: "1",
		});
		expect(files).toEqual([
			{ path: "README.md", sha: "sha-readme", size: 120 },
			{ path: "docs/guide.md", sha: "sha-guide", size: 220 },
		]);
	});

	it("throws a typed error when GitHub returns a truncated recursive tree", async () => {
		const getTree = mock(async () => ({
			data: {
				tree: [{ path: "README.md", type: "blob", sha: "sha-readme", size: 120 }],
				truncated: true,
			},
			headers: {},
		}));

		const octokit = {
			rest: {
				git: {
					getTree,
					getBlob: mock(),
				},
				repos: {
					getContent: mock(),
				},
			},
		};

		await expect(fetchRepoTree(octokit, "synk", "synk-ai", "main")).rejects.toBeInstanceOf(
			GitHubRepositoryTreeError,
		);
		await expect(fetchRepoTree(octokit, "synk", "synk-ai", "main")).rejects.toMatchObject({
			name: "GitHubRepositoryTreeError",
			code: "truncated-tree",
		});
	});
});

describe("fetchFileContent", () => {
	it("returns decoded file content from the contents API", async () => {
		const getContent = mock(async () => ({
			data: {
				type: "file",
				path: "docs/intro.md",
				sha: "sha-intro",
				size: 10,
				encoding: "base64",
				content: "aGVsbG8gd29ybGQ=",
			},
			headers: {},
		}));

		const octokit = {
			rest: {
				git: {
					getTree: mock(),
					getBlob: mock(),
				},
				repos: {
					getContent,
				},
			},
		};

		const file = await fetchFileContent(octokit, {
			owner: "synk",
			repo: "synk-ai",
			path: "docs/intro.md",
			ref: "main",
		});

		expect(getContent).toHaveBeenCalledWith({
			owner: "synk",
			repo: "synk-ai",
			path: "docs/intro.md",
			ref: "main",
		});
		expect(file).toEqual({
			path: "docs/intro.md",
			sha: "sha-intro",
			size: 10,
			content: "hello world",
		});
	});

	it("falls back to the blob API when contents API omits large file content", async () => {
		const getContent = mock(async () => ({
			data: {
				type: "file",
				path: "docs/large.md",
				sha: "sha-large",
				size: 1_500_000,
				encoding: "base64",
				content: "",
			},
			headers: {},
		}));
		const getBlob = mock(async () => ({
			data: {
				encoding: "base64",
				content: "bGFyZ2UgY29udGVudA==",
			},
			headers: {},
		}));

		const octokit = {
			rest: {
				git: {
					getTree: mock(),
					getBlob,
				},
				repos: {
					getContent,
				},
			},
		};

		const file = await fetchFileContent(octokit, "synk", "synk-ai", "docs/large.md", "main");

		expect(getBlob).toHaveBeenCalledWith({
			owner: "synk",
			repo: "synk-ai",
			file_sha: "sha-large",
		});
		expect(file.content).toBe("large content");
	});

	it("throws a typed error when the path points to a directory", async () => {
		const getContent = mock(async () => ({
			data: [{ type: "file", path: "docs/intro.md" }],
			headers: {},
		}));
		const octokit = {
			rest: {
				git: {
					getTree: mock(),
					getBlob: mock(),
				},
				repos: {
					getContent,
				},
			},
		};

		await expect(
			fetchFileContent(octokit, "synk", "synk-ai", "docs", "main"),
		).rejects.toMatchObject({
			name: "GitHubRepositoryContentError",
			code: "path-is-directory",
		});
	});

	it("throws a typed error when GitHub returns an unsupported content encoding", async () => {
		const getContent = mock(async () => ({
			data: {
				type: "file",
				path: "docs/intro.md",
				sha: "sha-intro",
				size: 10,
				encoding: "utf-8",
				content: "hello world",
			},
			headers: {},
		}));
		const octokit = {
			rest: {
				git: {
					getTree: mock(),
					getBlob: mock(),
				},
				repos: {
					getContent,
				},
			},
		};

		await expect(
			fetchFileContent(octokit, "synk", "synk-ai", "docs/intro.md", "main"),
		).rejects.toBeInstanceOf(GitHubRepositoryContentError);
		await expect(
			fetchFileContent(octokit, "synk", "synk-ai", "docs/intro.md", "main"),
		).rejects.toMatchObject({
			name: "GitHubRepositoryContentError",
			code: "unsupported-encoding",
		});
	});

	it("throws a typed error when blob fallback is required but file sha is missing", async () => {
		const getContent = mock(async () => ({
			data: {
				type: "file",
				path: "docs/large.md",
				sha: "",
				size: 1_500_000,
				encoding: "base64",
				content: "",
			},
			headers: {},
		}));
		const octokit = {
			rest: {
				git: {
					getTree: mock(),
					getBlob: mock(),
				},
				repos: {
					getContent,
				},
			},
		};

		await expect(
			fetchFileContent(octokit, "synk", "synk-ai", "docs/large.md", "main"),
		).rejects.toMatchObject({
			name: "GitHubRepositoryContentError",
			code: "missing-blob-sha",
		});
	});

	it("throws a typed error when blob fallback returns no content", async () => {
		const getContent = mock(async () => ({
			data: {
				type: "file",
				path: "docs/large.md",
				sha: "sha-large",
				size: 1_500_000,
				encoding: "base64",
				content: "",
			},
			headers: {},
		}));
		const getBlob = mock(async () => ({
			data: {
				encoding: "base64",
				content: "",
			},
			headers: {},
		}));
		const octokit = {
			rest: {
				git: {
					getTree: mock(),
					getBlob,
				},
				repos: {
					getContent,
				},
			},
		};

		await expect(
			fetchFileContent(octokit, "synk", "synk-ai", "docs/large.md", "main"),
		).rejects.toMatchObject({
			name: "GitHubRepositoryContentError",
			code: "missing-content",
		});
	});
});

describe("fetchMultipleFiles", () => {
	it("backs off when rate limit is low while batch fetching", async () => {
		jest.useFakeTimers();
		setSystemTime(new Date("2026-02-19T00:00:00.000Z"));

		const getContent = mock()
			.mockResolvedValueOnce({
				data: {
					type: "file",
					path: "docs/a.md",
					sha: "sha-a",
					size: 4,
					encoding: "base64",
					content: "dGVzdA==",
				},
				headers: {
					"x-ratelimit-remaining": "1",
					"x-ratelimit-reset": "1771459201",
				},
			})
			.mockResolvedValueOnce({
				data: {
					type: "file",
					path: "docs/b.md",
					sha: "sha-b",
					size: 4,
					encoding: "base64",
					content: "dGVzdA==",
				},
				headers: {
					"x-ratelimit-remaining": "100",
					"x-ratelimit-reset": "1771459201",
				},
			});

		const octokit = {
			rest: {
				git: {
					getTree: mock(),
					getBlob: mock(),
				},
				repos: {
					getContent,
				},
			},
		};

		const resultPromise = fetchMultipleFiles(octokit, {
			owner: "synk",
			repo: "synk-ai",
			paths: ["docs/a.md", "docs/b.md"],
			ref: "main",
		});

		jest.advanceTimersByTime(1_500);
		const result = await resultPromise;

		expect(getContent).toHaveBeenCalledTimes(2);
		expect(result).toHaveLength(2);

		jest.useRealTimers();
	});
});
