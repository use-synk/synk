import { type BetterAuthOptions, betterAuth } from "better-auth";

import { db } from "@synk-ai/db";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { toNextJsHandler } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { roles } from "./ac/org.js";

export function createAuth({
	secret,
}: {
	secret: string;
}) {
	const baseAuthOptions = {
		database: prismaAdapter(db, {
			provider: "postgresql",
			transaction: true,
		}),
		plugins: [
			organization({
				roles,
			}),
		],
	} satisfies BetterAuthOptions;

	return betterAuth({
		...baseAuthOptions,
		secret,
	});
}

export type Session = Awaited<ReturnType<typeof createAuth>>["$Infer"]["Session"];

export { toNextJsHandler };
