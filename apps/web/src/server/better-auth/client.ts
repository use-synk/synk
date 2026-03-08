import { env } from "@/env";
import { type Session, createClient } from "@synk-ai/auth/client";

const apiUrl = new URL(env.NEXT_PUBLIC_API_URL);
const normalizedPathname = apiUrl.pathname.replace(/\/+$/, "");
const authBasePath = `${normalizedPathname}/auth`;

export const authClient = createClient({ baseURL: apiUrl.origin, basePath: authBasePath });

export type { Session };
