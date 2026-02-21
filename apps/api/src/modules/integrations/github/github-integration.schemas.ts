import z from "zod";

export const initiateInstallationBodySchema = z
	.object({
		organizationId: z.string().uuid(),
	})
	.strict();

/**
 * Query parameters GitHub appends to the callback URL after installation.
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token
 */
export const installationCallbackQuerySchema = z.object({
	installation_id: z.coerce.number().int().positive(),
	setup_action: z.enum(["install", "update"]),
	state: z.string().min(1),
});
