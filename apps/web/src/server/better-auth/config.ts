import { env } from "@/env";
import { createAuth } from "@synk-ai/auth/server";

/**
 * Cross-domain cookie attributes so the session cookie is sent when the browser
 * calls the API (different origin). Required for Better Auth + Hono when the web
 * app and API are on different origins (see better-auth.com/docs/integrations/hono).
 * In development with HTTP, secure must be false or the cookie is not set.
 */
export const auth = createAuth({
	secret: env.BETTER_AUTH_SECRET,
	github: {
		clientId: env.BETTER_AUTH_GITHUB_CLIENT_ID,
		clientSecret: env.BETTER_AUTH_GITHUB_CLIENT_SECRET,
	},
	advanced: {
		defaultCookieAttributes: {
			sameSite: "none",
			secure: process.env.NODE_ENV === "production",
			partitioned: true,
		},
	},
});

export type Session = typeof auth.$Infer.Session;
