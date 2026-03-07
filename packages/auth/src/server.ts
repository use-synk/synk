import { type BetterAuthOptions, betterAuth } from "better-auth/minimal";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { db } from "@synk-ai/db";
import { toNextJsHandler } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { roles } from "./ac/org";

export function createAuth({
	secret,
	github,
	basePath,
	trustedOrigins,
}: {
	secret: string;
	github: {
		clientId: string;
		clientSecret: string;
	};
	basePath?: string;
	trustedOrigins?: string[];
}) {
	const baseAuthOptions = {
		database: prismaAdapter(db, {
			provider: "postgresql",
			transaction: true,
		}),
		advanced: {
			database: {
				generateId: "uuid",
			},
		},
		plugins: [
			organization({
				roles,
			}),
		],
		emailAndPassword: {
			enabled: false,
		},
		socialProviders: {
			github: {
				clientId: github.clientId,
				clientSecret: github.clientSecret,
			},
		},
	} satisfies BetterAuthOptions;

	return betterAuth({
		...baseAuthOptions,
		secret,
		...(basePath !== undefined ? { basePath } : {}),
		...(trustedOrigins !== undefined ? { trustedOrigins } : {}),
	});
}

export type Session = Awaited<ReturnType<typeof createAuth>>["$Infer"]["Session"];

export { toNextJsHandler };
