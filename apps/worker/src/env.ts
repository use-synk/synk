import {
	parseEnvironment,
	sharedEnvironmentSchema,
	suggestionInboxFeatureFlagsSchema,
} from "@synk-ai/shared";
import { z } from "zod";

export const workerEnvironmentSchema = sharedEnvironmentSchema
	.extend({
		LOG_LEVEL: z
			.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
			.default("info"),
		REDIS_URL: z.string().min(1),
		WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
		OPENROUTER_API_KEY: z.string().min(1).optional(),
	})
	.extend(suggestionInboxFeatureFlagsSchema.shape);

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const parseWorkerEnvironment = (): WorkerEnvironment =>
	parseEnvironment(workerEnvironmentSchema);
