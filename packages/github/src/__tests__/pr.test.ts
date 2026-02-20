import { afterEach, describe, expect, it, mock, setSystemTime } from "bun:test";

import { createDocUpdatePR } from "../pr";

const createOctokitMock = () => {
	const getRef = mock(async () => ({ data: { object: { sha: "base-commit-sha" } } }));
	const getCommit = mock(async () => ({ data: { tree: { sha: "base-tree-sha" } } }));
	const createTree = mock(async () => ({ data: { sha: "new-tree-sha" } }));
	const createCommit = mock(async () => ({ data: { sha: "new-commit-sha" } }));
	const createRef = mock(async () => ({}));
	const createPull = mock(async () => ({ data: { number: 42, html_url: "https://github.com/acme/docs/pull/42" } }));
	const addLabels = mock(async () => ({}));
	const addAssignees = mock(async () => ({}));
	const requestReviewers = mock(async () => ({}));

	return {
		octokit: {
			rest: {
				git: {
					getRef,
					getCommit,
					createTree,
					createCommit,
					createRef,
				},
				pulls: {
					create: createPull,
					requestReviewers,
				},
				issues: {
					addLabels,
					addAssignees,
				},
			},
		},
		getRef,
		getCommit,
		createTree,
		createCommit,
		createRef,
		createPull,
		addLabels,
		addAssignees,
		requestReviewers,
	};
};

describe("createDocUpdatePR", () => {
	afterEach(() => {
		setSystemTime();
	});

	it("creates one commit from tree API updates and opens a PR", async () => {
		setSystemTime(new Date("2026-02-19T12:34:56.000Z"));
		const {
			octokit,
			getRef,
			getCommit,
			createTree,
			createCommit,
			createRef,
			createPull,
			addLabels,
			addAssignees,
			requestReviewers,
		} = createOctokitMock();

		const result = await createDocUpdatePR(octokit, {
			owner: "acme",
			repo: "docs",
			baseBranch: "main",
			files: [
				{ path: "docs/intro.md", content: "# Intro", reasoning: "Updated onboarding instructions." },
				{ path: "docs/setup.md", content: "# Setup", reasoning: "Documented a new env var." },
			],
			triggerInfo: {
				type: "push",
				ref: "refs/heads/main",
				commitSha: "abcdef1234567890",
			},
		});

		expect(result).toEqual({
			prNumber: 42,
			prUrl: "https://github.com/acme/docs/pull/42",
			branchName: "synk-ai/docs-abcdef1-20260219-123456",
		});
		expect(getRef).toHaveBeenCalledWith({
			owner: "acme",
			repo: "docs",
			ref: "heads/main",
		});
		expect(getCommit).toHaveBeenCalledWith({
			owner: "acme",
			repo: "docs",
			commit_sha: "base-commit-sha",
		});
		expect(createTree).toHaveBeenCalledWith({
			owner: "acme",
			repo: "docs",
			base_tree: "base-tree-sha",
			tree: [
				{ path: "docs/intro.md", mode: "100644", type: "blob", content: "# Intro" },
				{ path: "docs/setup.md", mode: "100644", type: "blob", content: "# Setup" },
			],
		});
		expect(createCommit).toHaveBeenCalledWith({
			owner: "acme",
			repo: "docs",
			message: "docs: update docs/intro.md and docs/setup.md",
			tree: "new-tree-sha",
			parents: ["base-commit-sha"],
		});
		expect(createRef).toHaveBeenCalledWith({
			owner: "acme",
			repo: "docs",
			ref: "refs/heads/synk-ai/docs-abcdef1-20260219-123456",
			sha: "new-commit-sha",
		});
		expect(createPull).toHaveBeenCalledWith(
			expect.objectContaining({
				owner: "acme",
				repo: "docs",
				head: "synk-ai/docs-abcdef1-20260219-123456",
				base: "main",
				draft: false,
				title: expect.stringMatching(/^docs: update documentation for /u),
			}),
		);
		expect(addLabels).toHaveBeenCalledWith({
			owner: "acme",
			repo: "docs",
			issue_number: 42,
			labels: ["synk-ai", "documentation"],
		});
		expect(addAssignees).not.toHaveBeenCalled();
		expect(requestReviewers).not.toHaveBeenCalled();
	});

	it("applies configurable labels, assignees, reviewers and draft mode", async () => {
		const { octokit, createPull, addLabels, addAssignees, requestReviewers } = createOctokitMock();

		await createDocUpdatePR(octokit, {
			owner: "acme",
			repo: "docs",
			baseBranch: "main",
			files: [{ path: "docs/changelog.md", content: "# Changelog" }],
			triggerInfo: {
				type: "merge",
				ref: "refs/pull/12/merge",
				commitSha: "abcdef1234567890",
				prNumber: 12,
				prTitle: "feat: add new pipeline step",
			},
			config: {
				labels: ["synk-ai", "custom", "custom"],
				assignees: ["alice", "alice", "bob"],
				reviewers: ["carol"],
				draft: true,
			},
		});

		expect(createPull).toHaveBeenCalledWith(
			expect.objectContaining({
				draft: true,
			}),
		);
		expect(addLabels).toHaveBeenCalledWith(
			expect.objectContaining({
				labels: ["synk-ai", "custom"],
			}),
		);
		expect(addAssignees).toHaveBeenCalledWith(
			expect.objectContaining({
				assignees: ["alice", "bob"],
			}),
		);
		expect(requestReviewers).toHaveBeenCalledWith(
			expect.objectContaining({
				reviewers: ["carol"],
			}),
		);
	});

	it("references source commit in body when docs are updated in a separate repo", async () => {
		const { octokit, createPull } = createOctokitMock();

		await createDocUpdatePR(octokit, {
			owner: "acme",
			repo: "docs-site",
			baseBranch: "main",
			files: [{ path: "docs/guide.md", content: "# Guide" }],
			triggerInfo: {
				type: "push",
				ref: "refs/heads/main",
				commitSha: "feedface12345678",
				sourceOwner: "acme",
				sourceRepo: "app",
			},
		});

		expect(createPull).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining(
					"Source commit: https://github.com/acme/app/commit/feedface12345678",
				),
			}),
		);
	});

	it("renders a manual-run trigger label in the PR body", async () => {
		const { octokit, createPull } = createOctokitMock();

		await createDocUpdatePR(octokit, {
			owner: "acme",
			repo: "docs",
			baseBranch: "main",
			files: [{ path: "docs/guide.md", content: "# Guide" }],
			triggerInfo: {
				type: "manual",
				ref: "refs/heads/release",
				commitSha: "deadbeefcafebabefeedface12345678",
			},
		});

		expect(createPull).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.stringContaining("Manual run on `refs/heads/release`"),
			}),
		);
	});

	it("keeps the pull request title at or below 72 characters", async () => {
		const { octokit, createPull } = createOctokitMock();

		await createDocUpdatePR(octokit, {
			owner: "acme",
			repo: "docs",
			baseBranch: "main",
			files: [
				{
					path: "docs/this/is/a/very/long/path/that/would/overflow/the/default/limit.md",
					content: "body",
				},
			],
			triggerInfo: {
				type: "push",
				ref: "refs/heads/main",
				commitSha: "abcdef1234567890",
			},
		});

		const pullPayload = createPull.mock.calls[0]?.[0];
		expect(typeof pullPayload?.title).toBe("string");
		expect((pullPayload?.title as string).length).toBeLessThanOrEqual(72);
	});

	it("throws when called with no files", async () => {
		const { octokit } = createOctokitMock();

		await expect(
			createDocUpdatePR(octokit, {
				owner: "acme",
				repo: "docs",
				baseBranch: "main",
				files: [],
				triggerInfo: {
					type: "push",
					ref: "refs/heads/main",
					commitSha: "abcdef1234567890",
				},
			}),
		).rejects.toThrow("requires at least one file update");
	});

	it("retries with a suffixed branch name when the first ref already exists", async () => {
		setSystemTime(new Date("2026-02-19T12:34:56.000Z"));
		const { octokit, createRef } = createOctokitMock();
		createRef
			.mockRejectedValueOnce(Object.assign(new Error("Reference already exists"), { status: 422 }))
			.mockResolvedValueOnce({});

		const result = await createDocUpdatePR(octokit, {
			owner: "acme",
			repo: "docs",
			baseBranch: "main",
			files: [{ path: "docs/intro.md", content: "# Intro" }],
			triggerInfo: {
				type: "push",
				ref: "refs/heads/main",
				commitSha: "abcdef1234567890",
			},
		});

		expect(createRef).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				ref: "refs/heads/synk-ai/docs-abcdef1-20260219-123456",
			}),
		);
		expect(createRef).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				ref: "refs/heads/synk-ai/docs-abcdef1-20260219-123456-2",
			}),
		);
		expect(result.branchName).toBe("synk-ai/docs-abcdef1-20260219-123456-2");
	});

	it("does not retry on unrelated 422 validation errors", async () => {
		setSystemTime(new Date("2026-02-19T12:34:56.000Z"));
		const { octokit, createRef } = createOctokitMock();
		const validationError = Object.assign(new Error("Validation Failed"), {
			status: 422,
			response: {
				data: {
					message: "Validation Failed",
					errors: [{ code: "invalid", message: "Object does not exist" }],
				},
			},
		});
		createRef.mockRejectedValueOnce(validationError);

		await expect(
			createDocUpdatePR(octokit, {
				owner: "acme",
				repo: "docs",
				baseBranch: "main",
				files: [{ path: "docs/intro.md", content: "# Intro" }],
				triggerInfo: {
					type: "push",
					ref: "refs/heads/main",
					commitSha: "abcdef1234567890",
				},
			}),
		).rejects.toThrow("Validation Failed");
		expect(createRef).toHaveBeenCalledTimes(1);
	});
});
