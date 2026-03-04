export type PromptRole = "system" | "user";

export type PromptMessage = {
	role: PromptRole;
	content: string;
};

/**
 * Semver-formatted version string for prompt modules.
 * Enforced statically — prevents empty strings or freeform labels.
 */
export type PromptVersion = `${number}.${number}.${number}`;
