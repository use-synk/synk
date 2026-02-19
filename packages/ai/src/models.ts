export type LogicalModelName = "triage" | "generate";

export type ModelSelectionMap = Record<LogicalModelName, string>;

export const DEFAULT_MODEL_SELECTION: ModelSelectionMap = {
	triage: "anthropic/claude-sonnet-4.5",
	generate: "anthropic/claude-opus-4.6",
};

export const resolveModelSelection = (
	overrides: Partial<ModelSelectionMap> | undefined,
): ModelSelectionMap => ({
	triage: overrides?.triage ?? DEFAULT_MODEL_SELECTION.triage,
	generate: overrides?.generate ?? DEFAULT_MODEL_SELECTION.generate,
});

export const modelIdFor = (
	logicalModel: LogicalModelName,
	modelSelection: ModelSelectionMap,
): string => modelSelection[logicalModel];
