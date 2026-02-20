import type { DiffFile } from "../../diff";

interface GitHubFixtureFile {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
}

export const PUSH_COMPARE_FILES_FIXTURE: readonly GitHubFixtureFile[] = [
	{
		filename: "src/index.ts",
		status: "modified",
		additions: 12,
		deletions: 3,
		patch: "@@ -1,3 +1,12 @@",
	},
	{
		filename: "docs/old-name.md",
		status: "renamed",
		additions: 0,
		deletions: 0,
		previous_filename: "docs/legacy-name.md",
	},
	{
		filename: "assets/logo.png",
		status: "added",
		additions: 0,
		deletions: 0,
	},
];

export const PR_FILES_PAGE_ONE_FIXTURE: readonly GitHubFixtureFile[] = [
	...Array.from({ length: 100 }, (_unused, index) => ({
		filename: `src/components/file-${index + 1}.ts`,
		status: "modified",
		additions: index + 1,
		deletions: 0,
		patch: "@@ -1,1 +1,1 @@",
	})),
];

export const PR_FILES_PAGE_TWO_FIXTURE: readonly GitHubFixtureFile[] = [
	{
		filename: "docs/new-path.md",
		status: "renamed",
		additions: 4,
		deletions: 2,
		patch: "@@ -1,2 +1,4 @@",
		previous_filename: "docs/old-path.md",
	},
	{
		filename: "pnpm-lock.yaml",
		status: "modified",
		additions: 10,
		deletions: 10,
	},
];

export const NORMALIZED_DIFF_FIXTURE: readonly DiffFile[] = [
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
	{
		filename: "assets/logo.png",
		status: "added",
		additions: 0,
		deletions: 0,
		patch: null,
		previousFilename: null,
	},
];
