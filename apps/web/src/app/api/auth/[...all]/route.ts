import { auth } from "@/server/better-auth";
import { toNextJsHandler } from "@synk-ai/auth/server";

export const { GET, POST } = toNextJsHandler(auth.handler);
