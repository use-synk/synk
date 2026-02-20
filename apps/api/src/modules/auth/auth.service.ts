import { createAuth } from "@synk-ai/auth/server";

export function createAuthService() {
	const auth = createAuth({
		github: {
			clientId: process.env.BETTER_AUTH_GITHUB_CLIENT_ID!,
			clientSecret: process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET!,
		},
		secret: process.env.BETTER_AUTH_SECRET!,
	});

	return {
		auth,
	};
}

export type AuthService = ReturnType<typeof createAuthService>;
