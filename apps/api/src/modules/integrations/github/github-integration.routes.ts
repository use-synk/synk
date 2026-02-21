import { Hono } from "hono";
import z from "zod";
import { AccessDeniedError } from "../../../domain/errors/access-denied-error";
import { InstallationStateError } from "../../../domain/errors/installation-state-error";
import type { GitHubIntegrationServiceContract } from "../../../domain/services/github-integration-service";
import { createRequireAuthMiddleware } from "../../../middleware/auth";
import type { AppEnv, AuthenticatedAppEnv, RouteContext } from "../../../types";
import {
	initiateInstallationBodySchema,
	installationCallbackQuerySchema,
} from "./github-integration.schemas";

export type GitHubIntegrationRouteOptions = RouteContext & {
	integrationService: GitHubIntegrationServiceContract;
	corsOrigin: string;
};

export function createGitHubIntegrationRoutes(
	options: GitHubIntegrationRouteOptions,
): Hono<AppEnv> {
	const { auth, integrationService, corsOrigin } = options;

	const router = new Hono<AppEnv>();

	/**
	 * POST /install/init
	 *
	 * Initiates the GitHub App installation flow. Generates a CSRF state token
	 * and returns the GitHub redirect URL. Requires an authenticated session.
	 *
	 * @throws 400 if the request body is invalid.
	 * @throws 403 if the user is not a member of the target organization.
	 */
	router.post("/install/init", createRequireAuthMiddleware(auth), async (ctx) => {
		const authedCtx = ctx as typeof ctx & { var: AuthenticatedAppEnv["Variables"] };
		const userId = authedCtx.get("user").id;

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			return ctx.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON payload" } }, 400);
		}

		const bodyResult = initiateInstallationBodySchema.safeParse(body);
		if (!bodyResult.success) {
			return ctx.json(
				{ error: { code: "BAD_REQUEST", message: z.prettifyError(bodyResult.error) } },
				400,
			);
		}

		const { organizationId } = bodyResult.data;

		const result = await integrationService.initiateInstallation({ userId, organizationId });

		return ctx.json({ data: { redirectUrl: result.redirectUrl } }, 200);
	});

	/**
	 * GET /install/callback
	 *
	 * Handles the redirect from GitHub after the user installs or updates the
	 * GitHub App. Validates the CSRF state token, links the installation to the
	 * organization, and syncs repositories.
	 *
	 * This endpoint is NOT authenticated — GitHub redirects users here directly,
	 * so there is no session. Authorization is established via the state token
	 * which was issued to an authenticated user in /install/init.
	 *
	 * Always responds with a redirect to the frontend. Error details are
	 * encoded as safe, opaque error codes — never raw messages — to avoid
	 * leaking internal state.
	 */
	router.get("/install/callback", async (ctx) => {
		const query = ctx.req.query();
		const queryResult = installationCallbackQuerySchema.safeParse(query);

		if (!queryResult.success) {
			return ctx.redirect(buildCallbackRedirectUrl(corsOrigin, "invalid_request"));
		}

		const { installation_id: installationId, state } = queryResult.data;

		try {
			await integrationService.completeInstallation({ token: state, installationId });
			return ctx.redirect(buildSuccessRedirectUrl(corsOrigin));
		} catch (error) {
			if (error instanceof InstallationStateError) {
				return ctx.redirect(buildCallbackRedirectUrl(corsOrigin, "invalid_state"));
			}
			if (error instanceof AccessDeniedError) {
				return ctx.redirect(buildCallbackRedirectUrl(corsOrigin, "access_denied"));
			}
			return ctx.redirect(buildCallbackRedirectUrl(corsOrigin, "internal_error"));
		}
	});

	return router;
}

const buildSuccessRedirectUrl = (corsOrigin: string): string =>
	`${corsOrigin}/settings/integrations?status=success`;

const buildCallbackRedirectUrl = (corsOrigin: string, code: string): string =>
	`${corsOrigin}/settings/integrations?status=error&code=${code}`;
