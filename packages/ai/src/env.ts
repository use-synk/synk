import { parseEnvironment, sharedEnvironmentSchema } from "@synk-ai/shared";
import { z } from "zod";

export const openRouterEnvironmentSchema = sharedEnvironmentSchema.extend({
	OPENROUTER_API_KEY: z.string().min(1),
});

export type OpenRouterEnvironment = z.infer<typeof openRouterEnvironmentSchema>;

export const parseOpenRouterEnvironment = (): OpenRouterEnvironment =>
	parseEnvironment(openRouterEnvironmentSchema);
