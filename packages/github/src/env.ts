import { parseEnvironment, sharedEnvironmentSchema } from "@synk-ai/shared";
import { z } from "zod";

/**
 * Credentials-only schema: the minimum env vars needed to authenticate as the
 * GitHub App or as a specific installation. Services that do not handle
 * webhooks (e.g. the worker) should use this schema so that they are not
 * required to supply GITHUB_WEBHOOK_SECRET.
 */
export const githubCredentialsEnvironmentSchema = sharedEnvironmentSchema.extend({
	GITHUB_APP_ID: z.coerce.number().int().positive(),
	GITHUB_PRIVATE_KEY: z.string().min(1),
});

export type GitHubCredentialsEnvironment = z.infer<typeof githubCredentialsEnvironmentSchema>;

/**
 * Full GitHub App env schema: extends credentials with the webhook secret
 * required by the webhook ingestion endpoint.
 */
export const githubEnvironmentSchema = githubCredentialsEnvironmentSchema.extend({
	GITHUB_WEBHOOK_SECRET: z.string().min(1),
});

export type GitHubEnvironment = z.infer<typeof githubEnvironmentSchema>;

export const parseGitHubCredentialsEnvironment = (): GitHubCredentialsEnvironment =>
	parseEnvironment(githubCredentialsEnvironmentSchema);

export const parseGitHubEnvironment = (): GitHubEnvironment =>
	parseEnvironment(githubEnvironmentSchema);
