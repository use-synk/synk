import { parseEnvironment, sharedEnvironmentSchema } from "@synk-ai/shared";
import { z } from "zod";

export const githubEnvironmentSchema = sharedEnvironmentSchema.extend({
	GITHUB_APP_ID: z.coerce.number().int().positive(),
	GITHUB_PRIVATE_KEY: z.string().min(1),
	GITHUB_WEBHOOK_SECRET: z.string().min(1),
});

export type GitHubEnvironment = z.infer<typeof githubEnvironmentSchema>;

export const parseGitHubEnvironment = (): GitHubEnvironment =>
	parseEnvironment(githubEnvironmentSchema);
