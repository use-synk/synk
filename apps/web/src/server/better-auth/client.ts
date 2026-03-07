import { env } from "@/env";
import { type Session, createClient } from "@synk-ai/auth/client";

const authBaseUrl = env.NEXT_PUBLIC_API_URL.endsWith("/")
	? `${env.NEXT_PUBLIC_API_URL}auth`
	: `${env.NEXT_PUBLIC_API_URL}/auth`;

export const authClient = createClient({ baseURL: authBaseUrl });

export type { Session };
