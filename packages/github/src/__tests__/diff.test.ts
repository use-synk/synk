import { describe, expect, it, mock } from "bun:test";

import {
	DEFAULT_DIFF_IGNORE_PATTERNS,
	type DiffFile,
	fetchPRDiff,
	fetchPushDiff,
	filterDiff,
} from "../diff";
import {
	NORMALIZED_DIFF_FIXTURE,
	PR_FILES_PAGE_ONE_FIXTURE,
	PR_FILES_PAGE_TWO_FIXTURE,
	PUSH_COMPARE_FILES_FIXTURE,
} from "./fixtures/diff.fixtures";

describe("fetchPushDiff", () => {
	it("fetches a compare diff and normalizes returned files", async () => {
		const compareCommitsWithBasehead = mock(async () => ({
			data: { files: PUSH_COMPARE_FILES_FIXTURE },
		}));

		const octokit = {
			rest: {
				repos: { compareCommitsWithBasehead },
				pulls: { listFiles: mock() },
			},
		};

		const files = await fetchPushDiff(octokit, {
			owner: "synk",
			repo: "synk-ai",
			before: "abc123",
			after: "def456",
		});

		expect(compareCommitsWithBasehead).toHaveBeenCalledWith({
			owner: "synk",
			repo: "synk-ai",
			basehead: "abc123...def456",
		});
		expect(files).toEqual(NORMALIZED_DIFF_FIXTURE);
	});

	it("returns an empty array when the compare response omits files", async () => {
		const compareCommitsWithBasehead = mock(async () => ({ data: {} }));
		const octokit = {
			rest: {
				repos: { compareCommitsWithBasehead },
				pulls: { listFiles: mock() },
			},
		};

		await expect(
			fetchPushDiff(octokit, {
				owner: "synk",
				repo: "synk-ai",
				before: "abc123",
				after: "def456",
			}),
		).resolves.toEqual([]);
	});

	it("accepts positional arguments for roadmap-compatible call sites", async () => {
		const compareCommitsWithBasehead = mock(async () => ({
			data: { files: PUSH_COMPARE_FILES_FIXTURE },
		}));
		const octokit = {
			rest: {
				repos: { compareCommitsWithBasehead },
				pulls: { listFiles: mock() },
			},
		};

		const files = await fetchPushDiff(octokit, "synk", "synk-ai", "base-sha", "head-sha");

		expect(compareCommitsWithBasehead).toHaveBeenCalledWith({
			owner: "synk",
			repo: "synk-ai",
			basehead: "base-sha...head-sha",
		});
		expect(files).toHaveLength(3);
	});
});

describe("fetchPRDiff", () => {
	it("paginates PR files in batches of 100 and normalizes results", async () => {
		const listFiles = mock()
			.mockResolvedValueOnce({ data: PR_FILES_PAGE_ONE_FIXTURE })
			.mockResolvedValueOnce({ data: PR_FILES_PAGE_TWO_FIXTURE });

		const octokit = {
			rest: {
				repos: { compareCommitsWithBasehead: mock() },
				pulls: { listFiles },
			},
		};

		const result = await fetchPRDiff(octokit, {
			owner: "synk",
			repo: "synk-ai",
			prNumber: 42,
		});

		expect(listFiles).toHaveBeenCalledTimes(2);
		expect(listFiles).toHaveBeenNthCalledWith(1, {
			owner: "synk",
			repo: "synk-ai",
			pull_number: 42,
			per_page: 100,
			page: 1,
		});
		expect(listFiles).toHaveBeenNthCalledWith(2, {
			owner: "synk",
			repo: "synk-ai",
			pull_number: 42,
			per_page: 100,
			page: 2,
		});
		expect(result).toHaveLength(102);
		expect(result[100]).toEqual({
			filename: "docs/new-path.md",
			status: "renamed",
			additions: 4,
			deletions: 2,
			patch: "@@ -1,2 +1,4 @@",
			previousFilename: "docs/old-path.md",
		});
		expect(result[101]).toEqual({
			filename: "pnpm-lock.yaml",
			status: "modified",
			additions: 10,
			deletions: 10,
			patch: null,
			previousFilename: null,
		});
	});

	it("accepts positional arguments for roadmap-compatible call sites", async () => {
		const listFiles = mock(async () => ({ data: PR_FILES_PAGE_TWO_FIXTURE }));
		const octokit = {
			rest: {
				repos: { compareCommitsWithBasehead: mock() },
				pulls: { listFiles },
			},
		};

		const files = await fetchPRDiff(octokit, "synk", "synk-ai", 123);

		expect(listFiles).toHaveBeenCalledWith({
			owner: "synk",
			repo: "synk-ai",
			pull_number: 123,
			per_page: 100,
			page: 1,
		});
		expect(files).toHaveLength(2);
	});
});

describe("filterDiff", () => {
	const INPUT_FILES: readonly DiffFile[] = [
		...NORMALIZED_DIFF_FIXTURE,
		{
			filename: "dist/generated.js",
			status: "added",
			additions: 11,
			deletions: 0,
			patch: "@@ -0,0 +1,11 @@",
			previousFilename: null,
		},
		{
			filename: "assets/font.woff2",
			status: "added",
			additions: 0,
			deletions: 0,
			patch: null,
			previousFilename: null,
		},
		{
			filename: "src/client.min.js",
			status: "modified",
			additions: 1,
			deletions: 1,
			patch: "@@ -1 +1 @@",
			previousFilename: null,
		},
	];

	it("applies default ignore patterns for lock files, generated files, images, and fonts", () => {
		const result = filterDiff(INPUT_FILES);

		expect(DEFAULT_DIFF_IGNORE_PATTERNS).toContain("pnpm-lock.yaml");
		expect(result).toEqual([
			{
				filename: "src/index.ts",
				status: "modified",
				additions: 12,
				deletions: 3,
				patch: "@@ -1,3 +1,12 @@",
				previousFilename: null,
			},
			{
				filename: "docs/old-name.md",
				status: "renamed",
				additions: 0,
				deletions: 0,
				patch: null,
				previousFilename: "docs/legacy-name.md",
			},
		]);
	});

	it("uses custom ignore patterns when provided", () => {
		const result = filterDiff(INPUT_FILES, ["**/*.ts"]);

		expect(result.map((file) => file.filename)).toEqual([
			"docs/old-name.md",
			"assets/logo.png",
			"dist/generated.js",
			"assets/font.woff2",
			"src/client.min.js",
		]);
	});

	it("keeps a renamed file when only the previous filename matches ignore patterns", () => {
		const result = filterDiff([
			{
				filename: "docs/new-doc.md",
				status: "renamed",
				additions: 1,
				deletions: 1,
				patch: null,
				previousFilename: "dist/new-doc.md",
			},
		]);

		expect(result).toEqual([
			{
				filename: "docs/new-doc.md",
				status: "renamed",
				additions: 1,
				deletions: 1,
				patch: null,
				previousFilename: "dist/new-doc.md",
			},
		]);
	});
});
