import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

import type { GitHubEnvironment } from "./env.js";

export interface GitHubAppCredentials {
	appId: number;
	privateKey: string;
}

/**
 * Normalize a private key that may have escaped newlines (e.g. from env vars
 * where literal `\n` is used instead of actual newline characters).
 */
const normalizePrivateKey = (key: string): string =>
	key.includes("\\n") ? key.replaceAll("\\n", "\n") : key;

/**
 * Extract typed credentials from a parsed GitHub environment object.
 * Normalizes the private key so it is safe to use as a PEM string regardless
 * of how the env var was set.
 */
export const credentialsFromEnvironment = (env: GitHubEnvironment): GitHubAppCredentials => ({
	appId: env.GITHUB_APP_ID,
	privateKey: normalizePrivateKey(env.GITHUB_PRIVATE_KEY),
});

/**
 * Create an Octokit client authenticated as the GitHub App itself (JWT auth).
 * Use this for App-level API calls such as listing installations.
 */
export const createAppOctokit = (credentials: GitHubAppCredentials): Octokit =>
	new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: credentials.appId,
			privateKey: credentials.privateKey,
		},
	});

/**
 * Create an Octokit client scoped to a specific installation.
 * All API calls will be authenticated with an installation access token,
 * which is the correct auth level for reading and writing repository data.
 */
export const createInstallationOctokit = (
	installationId: number,
	credentials: GitHubAppCredentials,
): Octokit =>
	new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: credentials.appId,
			privateKey: credentials.privateKey,
			installationId,
		},
	});
