import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL_SELECTION, modelIdFor, resolveModelSelection } from "../models.js";

describe("model selection", () => {
	it("uses defaults when no overrides are provided", () => {
		const selection = resolveModelSelection(undefined);
		expect(selection).toEqual(DEFAULT_MODEL_SELECTION);
	});

	it("applies overrides while preserving defaults for missing keys", () => {
		const selection = resolveModelSelection({ triage: "openai/gpt-5-mini" });
		expect(selection).toEqual({
			triage: "openai/gpt-5-mini",
			generate: DEFAULT_MODEL_SELECTION.generate,
		});
	});

	it("returns the model identifier for a logical model name", () => {
		const selection = resolveModelSelection({ generate: "anthropic/claude-opus-4.1" });
		expect(modelIdFor("triage", selection)).toBe(DEFAULT_MODEL_SELECTION.triage);
		expect(modelIdFor("generate", selection)).toBe("anthropic/claude-opus-4.1");
	});
});
