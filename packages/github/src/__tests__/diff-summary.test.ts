import { describe, expect, it, vi } from "vitest";

import { summarizeDiff } from "../diff-summary.js";
import type { DiffFile } from "../diff.js";

const toPatch = (input: { additions: readonly string[]; removals?: readonly string[] }): string => {
	const removalLines = (input.removals ?? []).map((line) => `-${line}`);
	const additionLines = input.additions.map((line) => `+${line}`);
	return ["@@ -1,1 +1,1 @@", ...removalLines, ...additionLines].join("\n");
};

const makeDiffFile = (input: {
	filename: string;
	patch: string;
	status?: string;
	additions?: number;
	deletions?: number;
}): DiffFile => ({
	filename: input.filename,
	status: input.status ?? "modified",
	additions: input.additions ?? 10,
	deletions: input.deletions ?? 5,
	patch: input.patch,
	previousFilename: null,
});

describe("summarizeDiff", () => {
	it("returns the full diff when it fits the token budget", async () => {
		const diff: readonly DiffFile[] = [
			makeDiffFile({
				filename: "src/feature.ts",
				patch: toPatch({ additions: ["export function doThing() {", "  return true;", "}"] }),
			}),
		];

		const result = await summarizeDiff(diff, 500);

		expect(result.strategy).toBe("full");
		expect(result.content).toContain("File: src/feature.ts");
		expect(result.changedFiles).toEqual(["src/feature.ts"]);
	});

	it("prioritizes source > config > tests and truncates large patches", async () => {
		const longRemovalBlock = Array.from(
			{ length: 400 },
			(_, index) => `const removed${index} = true;`,
		);
		const diff: readonly DiffFile[] = [
			makeDiffFile({
				filename: "tests/feature.test.ts",
				patch: toPatch({
					additions: ["it('works', () => expect(true).toBe(true));"],
					removals: longRemovalBlock,
				}),
			}),
			makeDiffFile({
				filename: "package.json",
				patch: toPatch({
					additions: ['"scripts": { "build": "tsc" }'],
					removals: longRemovalBlock,
				}),
			}),
			makeDiffFile({
				filename: "src/api/user.ts",
				patch: toPatch({
					additions: ["export function createUser() {", "  return null;", "}"],
					removals: longRemovalBlock,
				}),
			}),
		];

		const result = await summarizeDiff(diff, 450);

		expect(result.strategy).toBe("prioritized-truncated");
		expect(result.content).toContain("[patch truncated to additions + context]");
		const sourcePosition = result.content.indexOf("File: src/api/user.ts");
		const configPosition = result.content.indexOf("File: package.json");
		const testPosition = result.content.indexOf("File: tests/feature.test.ts");
		expect(sourcePosition).toBeGreaterThanOrEqual(0);
		expect(configPosition).toBeGreaterThan(sourcePosition);
		expect(testPosition).toBeGreaterThan(configPosition);
	});

	it("uses the fast model summarizer when truncated diff still exceeds budget", async () => {
		const veryLargePatch = toPatch({
			additions: Array.from(
				{ length: 600 },
				(_, index) => `export const value${index} = ${index};`,
			),
		});
		const diff: readonly DiffFile[] = [
			makeDiffFile({ filename: "src/large.ts", patch: veryLargePatch }),
		];
		const fastModelSummarizer = {
			summarize: vi.fn(async () =>
				[
					"Structured diff summary:",
					"Changed files: src/large.ts",
					"Added types: none",
					"Added functions: value0..value599 constants",
				].join("\n"),
			),
		};

		const result = await summarizeDiff(diff, 40, { fastModelSummarizer });

		expect(result.strategy).toBe("fast-model");
		expect(fastModelSummarizer.summarize).toHaveBeenCalledTimes(1);
		expect(result.content).toContain("Structured diff summary:");
	});

	it("falls back to a structured heuristic summary when no fast model is configured", async () => {
		const largeAdditions = Array.from(
			{ length: 500 },
			(_, index) => `export const generatedValue${index} = ${index};`,
		);
		const veryLargePatch = toPatch({
			additions: [
				...largeAdditions,
				"export interface CreateUserRequest {",
				"  email: string;",
				"}",
				"export function createUser() {",
				"  return null;",
				"}",
				"router.post('/users', createUser);",
			],
			removals: ["router.get('/users', listUsers);"],
		});
		const diff: readonly DiffFile[] = [
			makeDiffFile({ filename: "src/users.ts", patch: veryLargePatch }),
		];

		const result = await summarizeDiff(diff, 80);

		expect(result.strategy).toBe("heuristic-structured");
		expect(result.content).toContain("Changed files:");
		expect(result.content).toContain("Added endpoints");
		expect(result.content).toContain("Semantic meaning:");
	});

	it("throws when maxTokens is not a positive integer", async () => {
		const diff: readonly DiffFile[] = [
			makeDiffFile({
				filename: "src/feature.ts",
				patch: toPatch({ additions: ["export const ok = true;"] }),
			}),
		];

		await expect(summarizeDiff(diff, 0)).rejects.toThrow("maxTokens must be a positive integer");
	});
});
