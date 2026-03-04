import { describe, expect, it } from "bun:test";
import {
	resolveSuggestionInboxRolloutMode,
	suggestionInboxFeatureFlagsSchema,
} from "./env";

describe("suggestionInboxFeatureFlagsSchema", () => {
	it("defaults all flags to false", () => {
		expect(suggestionInboxFeatureFlagsSchema.parse({})).toEqual({
			SYNK_SUGGESTION_INBOX_ENABLED: false,
			SYNK_AUTOPR_DISABLED: false,
			SYNK_SUGGESTION_DECISION_MEMORY_ENABLED: false,
		});
	});

	it("parses explicit string values", () => {
		expect(
			suggestionInboxFeatureFlagsSchema.parse({
				SYNK_SUGGESTION_INBOX_ENABLED: "true",
				SYNK_AUTOPR_DISABLED: "false",
				SYNK_SUGGESTION_DECISION_MEMORY_ENABLED: "true",
			}),
		).toEqual({
			SYNK_SUGGESTION_INBOX_ENABLED: true,
			SYNK_AUTOPR_DISABLED: false,
			SYNK_SUGGESTION_DECISION_MEMORY_ENABLED: true,
		});
	});
});

describe("resolveSuggestionInboxRolloutMode", () => {
	it("keeps auto PR enabled unless inbox and disable flag are both set", () => {
		expect(
			resolveSuggestionInboxRolloutMode({
				SYNK_SUGGESTION_INBOX_ENABLED: false,
				SYNK_AUTOPR_DISABLED: true,
				SYNK_SUGGESTION_DECISION_MEMORY_ENABLED: true,
			}),
		).toEqual({
			suggestionInboxEnabled: false,
			autoPrEnabled: true,
			autoPrDisabledByFlag: true,
			decisionMemoryEnabled: false,
		});
	});

	it("disables auto PR only when inbox is enabled and disable flag is true", () => {
		expect(
			resolveSuggestionInboxRolloutMode({
				SYNK_SUGGESTION_INBOX_ENABLED: true,
				SYNK_AUTOPR_DISABLED: true,
				SYNK_SUGGESTION_DECISION_MEMORY_ENABLED: true,
			}),
		).toEqual({
			suggestionInboxEnabled: true,
			autoPrEnabled: false,
			autoPrDisabledByFlag: true,
			decisionMemoryEnabled: true,
		});
	});
});
