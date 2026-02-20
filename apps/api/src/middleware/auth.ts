import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthService } from "../modules/auth/auth.service";
import type { AuthenticatedAppEnv } from "../types";

/**
 * Middleware to require authentication.
 *
 * Verifies the current session and populates `user` and `session` on the context.
 * Throws `401 Unauthorized` when no valid session is present.
 */
export function createRequireAuthMiddleware({ auth }: AuthService) {
	return createMiddleware<AuthenticatedAppEnv>(async (ctx, next) => {
		const session = await auth.api.getSession({ headers: ctx.req.raw.headers });

		if (!session) {
			throw new HTTPException(401, { message: "Unauthorized" });
		}

		ctx.set("user", session.user);
		ctx.set("session", session.session);

		await next();
	});
}
