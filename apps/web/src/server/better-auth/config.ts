import { env } from "@/env";
import { createAuth } from "@synk-ai/auth/server";

export const auth = createAuth({
	secret: env.BETTER_AUTH_SECRET,
});

export type Session = typeof auth.$Infer.Session;
