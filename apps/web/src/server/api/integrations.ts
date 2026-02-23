import { type ApiContract, defineEndpoint } from "@/lib/api";
import z from "zod";

export const integrationsRoutes = {
	/**
	 * POST /integrations/github/install/init
	 *
	 * Initiates the GitHub App installation flow. Generates a CSRF state token
	 * and returns the GitHub redirect URL. Requires an authenticated session.
	 *
	 * @throws 400 if the request body is invalid.
	 * @throws 403 if the user is not a member of the target organization.
	 */
	"/integrations/github/install/init": {
		POST: defineEndpoint({
			method: "POST",
			body: z.object({
				organizationId: z.string(),
			}),
			response: z.object({
				data: z.object({
					redirectUrl: z.string().url(),
				}),
			}),
			key: () => ["integrations", "github", "install", "init"],
		}),
	},
	/**
	 * GET /integrations/github/install/callback
	 *
	 * Handles the redirect from GitHub after the user installs or updates the
	 * GitHub App. Validates the CSRF state token, links the installation to the
	 * organization, and syncs repositories.
	 *
	 * This endpoint is NOT authenticated — GitHub redirects users here directly,
	 * so there is no session. Authorization is established via the state token
	 * which was issued to an authenticated user in /install/init.
	 *
	 * Responds with JSON so the web app can handle redirect and error UI.
	 */
	"/integrations/github/install/callback": {
		GET: defineEndpoint({
			method: "GET",
			query: z.object({
				installationId: z.number(),
				state: z.string(),
				setupAction: z.string(), // TODO: We can tighten this type
			}),
			key: ({ query }) => [
				"integrations",
				"github",
				"install",
				"callback",
				`${query.installationId}`,
				query.state,
				query.setupAction,
			],
			response: z.object({
				data: z.object({
					organizationSlug: z.string(),
				}),
			}),
		}),
	},
} as const satisfies ApiContract;
