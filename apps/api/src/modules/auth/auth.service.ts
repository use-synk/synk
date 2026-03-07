import { createAuth } from "@synk-ai/auth/server";

const getRequiredEnvironmentVariable = (name: string): string => {
	const value = process.env[name];
	if (value === undefined || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
};

export function createAuthService() {
	const auth = createAuth({
		github: {
			clientId: getRequiredEnvironmentVariable("BETTER_AUTH_GITHUB_CLIENT_ID"),
			clientSecret: getRequiredEnvironmentVariable("BETTER_AUTH_GITHUB_CLIENT_SECRET"),
		},
		secret: getRequiredEnvironmentVariable("BETTER_AUTH_SECRET"),
		basePath: "/api/v1/auth",
	});

	return {
		auth,
	};
}

export type AuthService = ReturnType<typeof createAuthService>;
