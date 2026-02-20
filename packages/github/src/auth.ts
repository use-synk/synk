import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

import type { GitHubCredentialsEnvironment } from "./env";

export interface GitHubAppCredentials {
	appId: number;
	privateKey: string;
}

/**
 * Normalize a private key that may have escaped newlines (e.g. from env vars
 * where literal `\n` is used instead of actual newline characters).
 * Applied defensively inside every factory so callers need not pre-normalize.
 */
const normalizePrivateKey = (key: string): string =>
	key.includes("\\n") ? key.replaceAll("\\n", "\n") : key;

/**
 * Extract typed credentials from a parsed GitHub credentials environment
 * object. Accepts any environment that includes GITHUB_APP_ID and
 * GITHUB_PRIVATE_KEY — both GitHubCredentialsEnvironment and the superset
 * GitHubEnvironment satisfy this requirement.
 */
export const credentialsFromEnvironment = (
	env: GitHubCredentialsEnvironment,
): GitHubAppCredentials => ({
	appId: env.GITHUB_APP_ID,
	privateKey: env.GITHUB_PRIVATE_KEY,
});

/**
 * Create an Octokit client authenticated as the GitHub App itself (JWT auth).
 * Use this for App-level API calls such as listing installations.
 * The private key is normalized on every call so escaped newlines from env
 * var storage are handled transparently.
 */
export const createAppOctokit = (credentials: GitHubAppCredentials): Octokit =>
	new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: credentials.appId,
			privateKey: normalizePrivateKey(credentials.privateKey),
		},
	});

/**
 * Create an Octokit client scoped to a specific installation.
 * All API calls will be authenticated with an installation access token,
 * which is the correct auth level for reading and writing repository data.
 * Throws if installationId is not a positive integer.
 */
export const createInstallationOctokit = (
	installationId: number,
	credentials: GitHubAppCredentials,
): Octokit => {
	if (!Number.isInteger(installationId) || installationId <= 0) {
		throw new Error(`installationId must be a positive integer, got: ${installationId}`);
	}

	return new Octokit({
		authStrategy: createAppAuth,
		auth: {
			appId: credentials.appId,
			privateKey: normalizePrivateKey(credentials.privateKey),
			installationId,
		},
	});
};
