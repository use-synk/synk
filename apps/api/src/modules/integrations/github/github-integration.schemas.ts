import z from "zod";

// TODO: Add validation for organizationId
export const initiateInstallationBodySchema = z
	.object({
		organizationId: z.string(),
	})
	.strict();

/**
 * Query parameters GitHub appends to the callback URL after installation.
 * https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
 */
export const installationCallbackQuerySchema = z.object({
	installation_id: z.coerce.number().int().positive(),
	setup_action: z.enum(["install", "update"]),
	state: z.string().min(1),
});
