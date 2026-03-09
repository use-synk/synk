import { describe, expect, it } from "bun:test";
import type { runDetailSchema } from "@/api/endpoints";
import type z from "zod";
import { normalizeRunSteps } from "./normalize-run-steps";
import { runStepDefinitions } from "./run-steps";

type RunDetail = z.infer<typeof runDetailSchema>;

const baseRun = (): RunDetail => ({
	id: "run-1",
	repositoryId: "repo-1",
	status: "running",
	triggerType: "manual",
	triggerRef: "refs/heads/main",
	triggerCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	triggerMergeRequestNumber: null,
	triggerMeta: {},
	docsAffected: null,
	docPrNumber: null,
	docPrUrl: null,
	prLink: null,
	tokenUsage: {},
	error: null,
	attemptCount: 1,
	result: {},
	aiReasoning: {},
	queuedAt: "2026-03-09T11:00:00.000Z",
	startedAt: "2026-03-09T11:00:01.000Z",
	completedAt: null,
	createdAt: "2026-03-09T11:00:00.000Z",
	updatedAt: "2026-03-09T11:00:01.000Z",
	steps: [],
});

describe("normalizeRunSteps", () => {
	it("marks missing predefined steps as skipped", () => {
		const run = baseRun();
		run.steps = [
			{
				id: "step-1",
				runId: run.id,
				attemptNumber: 1,
				stepKey: "fetch-diff",
				status: "completed",
				result: { fileCount: 7 },
				errorCode: null,
				errorMessage: null,
				startedAt: run.startedAt,
				completedAt: run.updatedAt,
				durationMs: 300,
				createdAt: run.createdAt,
				updatedAt: run.updatedAt,
			},
		];

		const normalized = normalizeRunSteps(run);

		expect(normalized).toHaveLength(runStepDefinitions.length);
		expect(normalized.find((step) => step.key === "fetch-diff")?.status).toBe("completed");
		expect(normalized.find((step) => step.key === "create-pr")?.status).toBe("skipped");
	});

	it("surfaces failed steps with their error details", () => {
		const run = baseRun();
		run.steps = [
			{
				id: "step-2",
				runId: run.id,
				attemptNumber: 1,
				stepKey: "run-ai-generation",
				status: "failed",
				result: {},
				errorCode: "INTERNAL_ERROR",
				errorMessage: "Generation failed",
				startedAt: run.startedAt,
				completedAt: run.updatedAt,
				durationMs: 200,
				createdAt: run.createdAt,
				updatedAt: run.updatedAt,
			},
		];

		const failedStep = normalizeRunSteps(run).find((step) => step.key === "run-ai-generation");

		expect(failedStep?.status).toBe("failed");
		expect(failedStep?.errorCode).toBe("INTERNAL_ERROR");
		expect(failedStep?.errorMessage).toBe("Generation failed");
	});

	it("keeps completed step when result payload does not match schema", () => {
		const run = baseRun();
		run.steps = [
			{
				id: "step-3",
				runId: run.id,
				attemptNumber: 1,
				stepKey: "fetch-diff",
				status: "completed",
				result: { unexpected: true },
				errorCode: null,
				errorMessage: null,
				startedAt: run.startedAt,
				completedAt: run.updatedAt,
				durationMs: 120,
				createdAt: run.createdAt,
				updatedAt: run.updatedAt,
			},
		];

		const completedStep = normalizeRunSteps(run).find((step) => step.key === "fetch-diff");

		expect(completedStep?.status).toBe("completed");
		expect(completedStep?.result).toBeNull();
		expect(completedStep?.resultValidationError).toContain("fileCount");
	});
});
