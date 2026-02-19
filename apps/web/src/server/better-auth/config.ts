import { env } from "@/env";
import { createAuth } from "@synk-ai/auth/server";

export const auth = createAuth({
	secret: env.BETTER_AUTH_SECRET,
	github: {
		clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
		clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
	},
});

export type Session = typeof auth.$Infer.Session;
