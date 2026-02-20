import { describe, expect, it } from "bun:test";

import { parseSynkAiConfigFromYaml } from "./synk-config.js";

describe("parseSynkAiConfigFromYaml", () => {
	it("returns defaults for empty input", () => {
		expect(parseSynkAiConfigFromYaml("")).toEqual({
			docs: {},
			ignorePaths: [],
			triggers: { branches: ["main"], ignore_paths: [] },
			ai: {
				model: "auto",
				custom_instructions: "",
				triage_confidence_threshold: 0.7,
				token_budget: 80_000,
			},
			pr: {
				labels: ["documentation", "synk-ai"],
				draft: false,
				assignees: [],
				reviewers: [],
			},
		});
	});

	it("returns null for invalid yaml", () => {
		expect(parseSynkAiConfigFromYaml("docs:\n  framework: [")).toBeNull();
	});

	it("returns null for schema-invalid config", () => {
		const invalid = `
docs:
  framework: nextra
unexpected: true
`;
		expect(parseSynkAiConfigFromYaml(invalid)).toBeNull();
	});
});
