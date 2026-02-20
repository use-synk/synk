import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { DashboardServiceContract } from "../../domain/services/index";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import {
	listInstallationRepositoriesQuerySchema,
	listRepositoryRunsQuerySchema,
	patchRepositoryBodySchema,
	triggerManualRunBodySchema,
} from "./dashboard.schemas";

/**
 * @todo We will need to further refactor this to split the routes into
 * separate files when the dashboard implementation grows.
 */
export function createDashboardRoutes({
	auth,
	dashboardService,
}: RouteContext & {
	dashboardService: DashboardServiceContract;
}) {
	const router = new Hono<AuthenticatedAppEnv>();

	// After this middleware, the context will include the authenticated
	// user and session. Unauthenticated requests won't reach the routes below.
	router.use("*", createRequireAuthMiddleware(auth));

	/**
	 * PATCH /repos/:repoId
	 *
	 * Updates the repository activation and docs config.
	 */
	router.patch("/repos/:repoId", async (ctx) => {
		const userId = ctx.get("user").id;
		const repoId = ctx.req.param("repoId");

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}

		const bodyResult = patchRepositoryBodySchema.safeParse(body);

		if (!bodyResult.success) {
			throw new HTTPException(400, {
				message: z.prettifyError(bodyResult.error),
			});
		}

		const { isActive } = bodyResult.data;

		const result = await dashboardService.patchRepository({
			repositoryId: repoId,
			userId,
			...(isActive === undefined ? {} : { isActive }),
		});

		return ctx.json({
			data: {
				...result,
				createdAt: result.createdAt.toISOString(),
				updatedAt: result.updatedAt.toISOString(),
			},
		});
	});

	/**
	 * GET /repos/:repoId/runs
	 *
	 * Returns a list of runs for a given repository. Uses pagination to limit the
	 * number of runs returned.
	 *
	 * @throws 400 if the query parameters are invalid.
	 * @throws 403 if the user does not have access to the repository.
	 */
	router.get("/repos/:repoId/runs", async (ctx) => {
		const userId = ctx.get("user").id;
		const repoId = ctx.req.param("repoId");

		const query = ctx.req.query();
		const queryResult = listRepositoryRunsQuerySchema.safeParse(query);

		if (!queryResult.success) {
			throw new HTTPException(400, {
				message: z.prettifyError(queryResult.error),
			});
		}

		const { page = 1, pageSize = 10, status = [] } = queryResult.data;
		const filter = { page, pageSize, status };
		const result = await dashboardService.listRepositoryRuns({
			repositoryId: repoId,
			userId,
			filter,
		});

		return ctx.json({
			data: result.items.map((r) => ({
				...r,
				createdAt: r.createdAt.toISOString(),
			})),
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	/**
	 * POST /repos/:repoId/runs
	 *
	 * Triggers a manual run for a given repository.
	 *
	 * @throws 400 if the request body is invalid.
	 * @throws 403 if the user does not have access to the repository.
	 * @throws 409 if the run already exists.
	 */
	router.post("/repos/:repoId/runs", async (ctx) => {
		const userId = ctx.get("user").id;
		const repoId = ctx.req.param("repoId");

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}
		const bodyResult = triggerManualRunBodySchema.safeParse(body);

		if (!bodyResult.success) {
			throw new HTTPException(400, {
				message: z.prettifyError(bodyResult.error),
			});
		}

		const { commitSha, ref } = bodyResult.data;

		const result = await dashboardService.triggerManualRun({
			repositoryId: repoId,
			userId,
			commitSha,
			...(ref === undefined ? {} : { ref }),
		});

		return ctx.json({
			data: result,
		});
	});

	/**
	 * GET /runs/:runId
	 *
	 * Returns details for a given run.
	 *
	 * @throws 403 if the user does not have access to the run.
	 * @throws 404 if the run is not found.
	 */
	router.get("/runs/:runId", async (ctx) => {
		const userId = ctx.get("user").id;
		const runId = ctx.req.param("runId");

		const result = await dashboardService.getRunDetail(runId, userId);

		return ctx.json({
			data: {
				...result,
				queuedAt: result.queuedAt.toISOString(),
				startedAt: result.startedAt?.toISOString() ?? null,
				completedAt: result.completedAt?.toISOString() ?? null,
				createdAt: result.createdAt.toISOString(),
				updatedAt: result.updatedAt.toISOString(),
			},
		});
	});

	/**
	 * GET /installations
	 *
	 * Returns a list of installations that the user has access to. Uses pagination
	 * to limit the number of repositories returned.
	 *
	 * @throws 400 if the query parameters are invalid.
	 * @throws 403 if the user does not have access to the installation.
	 */
	router.get("/installations/:installationId/repos", async (ctx, _next) => {
		const userId = ctx.get("user").id;
		const installationId = ctx.req.param("installationId");

		const query = ctx.req.query();
		const queryResult = listInstallationRepositoriesQuerySchema.safeParse(query);

		if (!queryResult.success) {
			throw new HTTPException(400, {
				message: z.prettifyError(queryResult.error),
			});
		}

		const { page = 1, pageSize = 10 } = queryResult.data;
		const pagination = { page, pageSize };
		const result = await dashboardService.listInstallationRepositories({
			installationId,
			userId,
			pagination,
		});

		const data = result.items.map((r) => ({
			...r,
			updatedAt: r.updatedAt.toISOString(),
		}));

		return ctx.json({
			data,
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	return router;
}
