import { z as openApiZ } from "@hono/zod-openapi";
import { vcsProviderValues } from "@synk-ai/shared";

export const repositorySchema = openApiZ.object({
	fullName: openApiZ.string(),
	provider: openApiZ.enum(vcsProviderValues),
});
