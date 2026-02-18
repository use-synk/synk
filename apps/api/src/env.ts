import { parseEnvironment, sharedEnvironmentSchema } from "@synk-ai/shared";
import { z } from "zod";

export const apiEnvironmentSchema = sharedEnvironmentSchema.extend({
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	HOST: z.string().default("0.0.0.0"),
	CORS_ORIGIN: z.string().default("*"),
	LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
	GIT_SHA: z.string().default("unknown"),
});

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export const parseApiEnvironment = (): ApiEnvironment => parseEnvironment(apiEnvironmentSchema);
