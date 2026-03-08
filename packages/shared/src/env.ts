import { z } from "zod";

export const nodeEnvironmentSchema = z.enum(["development", "test", "production"]).optional();

const featureFlagSchema = z
	.enum(["true", "false"])
	.default("false")
	.transform((value) => value === "true");

export const suggestionInboxFeatureFlagsSchema = z.object({
	SYNK_SUGGESTION_INBOX_ENABLED: featureFlagSchema,
	SYNK_AUTOPR_DISABLED: featureFlagSchema,
	SYNK_SUGGESTION_DECISION_MEMORY_ENABLED: featureFlagSchema,
});

export type SuggestionInboxFeatureFlags = z.infer<typeof suggestionInboxFeatureFlagsSchema>;

export type SuggestionInboxRolloutMode = {
	suggestionInboxEnabled: boolean;
	decisionMemoryEnabled: boolean;
	autoPrEnabled: boolean;
	autoPrDisabledByFlag: boolean;
};

export const resolveSuggestionInboxRolloutMode = (
	flags: SuggestionInboxFeatureFlags,
): SuggestionInboxRolloutMode => {
	const suggestionInboxEnabled = flags.SYNK_SUGGESTION_INBOX_ENABLED;
	const autoPrDisabledByFlag = flags.SYNK_AUTOPR_DISABLED;
	return {
		suggestionInboxEnabled,
		decisionMemoryEnabled: suggestionInboxEnabled && flags.SYNK_SUGGESTION_DECISION_MEMORY_ENABLED,
		autoPrEnabled: !(suggestionInboxEnabled && autoPrDisabledByFlag),
		autoPrDisabledByFlag,
	};
};

export const sharedEnvironmentSchema = z.object({
	NODE_ENV: nodeEnvironmentSchema,
});

export const databaseEnvironmentSchema = sharedEnvironmentSchema.extend({
	DATABASE_URL: z.string().min(1),
});

export const parseEnvironment = <TSchema extends z.ZodType>(schema: TSchema): z.infer<TSchema> =>
	schema.parse(process.env);
