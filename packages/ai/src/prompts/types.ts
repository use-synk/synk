export type PromptRole = "system" | "user";

export type PromptMessage = {
	role: PromptRole;
	content: string;
};
