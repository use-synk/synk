import { type Session, createClient } from "@synk-ai/auth/client";

export const authClient = createClient();

export type { Session };
