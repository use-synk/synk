import { z } from "zod";

export const nodeEnvironmentSchema = z.enum(["development", "test", "production"]).optional();

export const sharedEnvironmentSchema = z.object({
	NODE_ENV: nodeEnvironmentSchema,
});

export const databaseEnvironmentSchema = sharedEnvironmentSchema.extend({
	DATABASE_URL: z.string().min(1),
});

export const parseEnvironment = <TSchema extends z.ZodType>(schema: TSchema): z.infer<TSchema> =>
	schema.parse(process.env);
