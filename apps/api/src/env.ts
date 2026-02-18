import { githubEnvironmentSchema } from "@synk-ai/github";
import { parseEnvironment } from "@synk-ai/shared";
import { z } from "zod";

export const apiEnvironmentSchema = githubEnvironmentSchema.extend({
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	HOST: z.string().default("0.0.0.0"),
	CORS_ORIGIN: z.string().default("*"),
	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
	GIT_SHA: z.string().default("unknown"),
	REDIS_URL: z.string().min(1),
	GITHUB_WEBHOOK_ORGANIZATION_ID: z.string().min(1).optional(),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export const parseApiEnvironment = (): ApiEnvironment => parseEnvironment(apiEnvironmentSchema);
