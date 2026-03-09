import type { runDetailSchema } from "@/api/endpoints";
import z from "zod";
import { type RunStepKey, runStepDefinitions } from "./run-steps";

type RunDetail = z.infer<typeof runDetailSchema>;
type RawRunStep = RunDetail["steps"][number];

export type NormalizedRunStep = {
	key: RunStepKey;
	title: string;
	status: "completed" | "failed" | "running" | "skipped";
	result: unknown | null;
	resultValidationError: string | null;
	errorCode: string | null;
	errorMessage: string | null;
};

const findLatestAttemptNumber = (steps: readonly RawRunStep[]): number => {
	let attemptNumber = 0;
	for (const step of steps) {
		if (step.attemptNumber > attemptNumber) {
			attemptNumber = step.attemptNumber;
		}
	}
	return attemptNumber;
};

function normalizeStepResult(
	step: RawRunStep,
	resultSchema: z.ZodType,
): {
	result: unknown | null;
	resultValidationError: string | null;
} {
	if (step.status !== "completed") {
		return {
			result: null,
			resultValidationError: null,
		};
	}

	const parseResult = resultSchema.safeParse(step.result);
	if (parseResult.success) {
		return {
			result: parseResult.data,
			resultValidationError: null,
		};
	}

	return {
		result: null,
		resultValidationError: z.prettifyError(parseResult.error),
	};
}

function normalizeMissingStep(definition: (typeof runStepDefinitions)[number]): NormalizedRunStep {
	return {
		key: definition.key,
		title: definition.title,
		status: "skipped",
		result: null,
		resultValidationError: null,
		errorCode: null,
		errorMessage: null,
	};
}

function normalizeExecutedStep(
	definition: (typeof runStepDefinitions)[number],
	step: RawRunStep,
): NormalizedRunStep {
	const result = normalizeStepResult(step, definition.resultSchema);
	return {
		key: definition.key,
		title: definition.title,
		status: step.status,
		result: result.result,
		resultValidationError: result.resultValidationError,
		errorCode: step.status === "failed" ? step.errorCode : null,
		errorMessage: step.status === "failed" ? step.errorMessage : null,
	};
}

export function normalizeRunSteps(run: RunDetail): readonly NormalizedRunStep[] {
	const latestAttemptNumber = findLatestAttemptNumber(run.steps);
	const attemptSteps = run.steps.filter((step) => step.attemptNumber === latestAttemptNumber);

	return runStepDefinitions.map((definition) => {
		const step = attemptSteps.find((item) => item.stepKey === definition.key);
		if (step === undefined) {
			return normalizeMissingStep(definition);
		}
		return normalizeExecutedStep(definition, step);
	});
}
