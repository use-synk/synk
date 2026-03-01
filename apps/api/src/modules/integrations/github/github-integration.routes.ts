import { OpenAPIHono, createRoute, z as openApiZ } from "@hono/zod-openapi";
import type { Hook } from "@hono/zod-openapi";
import { ERROR_CODES } from "@synk-ai/shared";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import { AccessDeniedError } from "../../../domain/errors/access-denied-error";
import { InstallationStateError } from "../../../domain/errors/installation-state-error";
import type { GitHubIntegrationServiceContract } from "../../../domain/services/github-integration-service";
import type { Logger } from "../../../logger";
import { createRequireAuthMiddleware } from "../../../middleware/auth";
import type { AppEnv, RouteContext } from "../../../types";
import {
	initiateInstallationBodySchema,
	installationCallbackQuerySchema,
} from "./github-integration.schemas";

export type GitHubIntegrationRouteOptions = RouteContext & {
	integrationService: GitHubIntegrationServiceContract;
	logger: Logger;
};

const githubIntegrationValidationHook: Hook<unknown, AppEnv, string, Response | undefined> = (
	result,
	ctx,
) => {
	if (result.success) {
		return;
	}

	const isMalformedJson =
		result.target === "json" &&
		(result.error.message.includes("Malformed JSON in request body") ||
			result.error.issues.some((issue) => issue.message === "Malformed JSON in request body"));
	const message = isMalformedJson ? "Invalid JSON payload" : z.prettifyError(result.error);

	return ctx.json({ error: { code: ERROR_CODES.BAD_REQUEST, message } }, 400);
};

export function createGitHubIntegrationRoutes(
	options: GitHubIntegrationRouteOptions,
): OpenAPIHono<AppEnv> {
	const { auth, integrationService, logger } = options;

	const router = new OpenAPIHono<AppEnv>();
	const installInitRoute = createRoute({
		method: "post",
		path: "/install/init",
		tags: ["integrations"],
		operationId: "initiateGithubInstallation",
		security: [{ cookieAuth: [] }],
		request: {
			body: {
				required: true,
				content: {
					"application/json": {
						schema: initiateInstallationBodySchema,
					},
				},
			},
		},
		responses: {
			200: {
				description: "GitHub installation flow started",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								redirectUrl: openApiZ.string().url(),
							}),
						}),
					},
				},
			},
			400: { description: "Bad request" },
			401: { description: "Unauthorized" },
			403: { description: "Forbidden" },
		},
	});
	const installCallbackRoute = createRoute({
		method: "get",
		path: "/install/callback",
		tags: ["integrations"],
		operationId: "completeGithubInstallation",
		request: {
			query: installationCallbackQuerySchema,
		},
		responses: {
			200: {
				description: "GitHub installation flow completed",
				content: {
					"application/json": {
						schema: openApiZ.object({
							data: openApiZ.object({
								organizationSlug: openApiZ.string(),
							}),
						}),
					},
				},
			},
			400: { description: "Bad request" },
			403: { description: "Forbidden" },
			422: { description: "Invalid/expired installation state" },
			500: { description: "Internal error" },
		},
	});

	/**
	 * POST /install/init
	 *
	 * Initiates the GitHub App installation flow. Generates a CSRF state token
	 * and returns the GitHub redirect URL. Requires an authenticated session.
	 *
	 * @throws 400 if the request body is invalid.
	 * @throws 403 if the user is not a member of the target organization.
	 */
	router.use(installInitRoute.getRoutingPath(), createRequireAuthMiddleware(auth));
	router.openapi(
		installInitRoute,
		async (ctx) => {
			const session = await auth.auth.api.getSession({ headers: ctx.req.raw.headers });
			if (!session) {
				throw new HTTPException(401, { message: "Unauthorized" });
			}

			let body: unknown;
			try {
				body = await ctx.req.json();
			} catch {
				throw new HTTPException(400, { message: "Invalid JSON payload" });
			}
			const bodyResult = initiateInstallationBodySchema.safeParse(body);
			if (!bodyResult.success) {
				throw new HTTPException(400, { message: z.prettifyError(bodyResult.error) });
			}
			const { organizationId } = bodyResult.data;

			const result = await integrationService.initiateInstallation({
				userId: session.user.id,
				organizationId,
			});

			return ctx.json({ data: { redirectUrl: result.redirectUrl } }, 200);
		},
		githubIntegrationValidationHook,
	);

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
	 * Responds with JSON so the web app can handle redirect and error UI.
	 */
	router.openapi(
		installCallbackRoute,
		async (ctx) => {
			const queryResult = installationCallbackQuerySchema.safeParse(ctx.req.query());
			if (!queryResult.success) {
				throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
			}
			const { installation_id: installationId, state } = queryResult.data;

			try {
				const result = await integrationService.completeInstallation({
					token: state,
					installationId,
				});
				return ctx.json({ data: { organizationSlug: result.organizationSlug } }, 200);
			} catch (error) {
				if (error instanceof InstallationStateError) {
					return ctx.json(
						{ error: { code: ERROR_CODES.UNPROCESSABLE_ENTITY, message: error.message } },
						422,
					);
				}
				if (error instanceof AccessDeniedError) {
					return ctx.json({ error: { code: ERROR_CODES.FORBIDDEN, message: error.message } }, 403);
				}
				logger.error({ err: error }, "unhandled error in github install callback");
				return ctx.json(
					{ error: { code: ERROR_CODES.INTERNAL_ERROR, message: "An internal error occurred" } },
					500,
				);
			}
		},
		githubIntegrationValidationHook,
	);

	return router;
}
