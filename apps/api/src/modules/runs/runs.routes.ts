import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { DashboardServiceContract } from "../../domain/services";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import { listRepositoryRunsQuerySchema, triggerManualRunBodySchema } from "./runs.schemas";

export function createRunsRoutes({
	auth,
	dashboardService,
}: RouteContext & {
	dashboardService: DashboardServiceContract;
}) {
	const router = new Hono<AuthenticatedAppEnv>();

	router.use("*", createRequireAuthMiddleware(auth));

	router.get("/:runId", async (ctx) => {
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

	router.get("/repositories/:repositoryId", async (ctx) => {
		const userId = ctx.get("user").id;
		const repositoryId = ctx.req.param("repositoryId");

		const query = ctx.req.query();
		const statusValues = ctx.req.queries("status") ?? [];
		const queryInput = {
			...query,
			...(statusValues.length > 0 ? { status: statusValues } : {}),
		};
		const queryResult = listRepositoryRunsQuerySchema.safeParse(queryInput);
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10, status } = queryResult.data;
		const result = await dashboardService.listRepositoryRuns({
			repositoryId,
			userId,
			filter: {
				page,
				pageSize,
				...(status === undefined ? {} : { status }),
			},
		});

		return ctx.json({
			data: result.items.map((run) => ({
				...run,
				createdAt: run.createdAt.toISOString(),
			})),
			pagination: {
				page,
				pageSize,
				total: result.total,
				totalPages: Math.ceil(result.total / pageSize),
			},
		});
	});

	router.post("/repositories/:repositoryId", async (ctx) => {
		const userId = ctx.get("user").id;
		const repositoryId = ctx.req.param("repositoryId");

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}

		const bodyResult = triggerManualRunBodySchema.safeParse(body);
		if (!bodyResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(bodyResult.error) });
		}

		const result = await dashboardService.triggerManualRun({
			repositoryId,
			userId,
			commitSha: bodyResult.data.commitSha,
			...(bodyResult.data.ref === undefined ? {} : { ref: bodyResult.data.ref }),
		});

		return ctx.json({ data: result });
	});

	return router;
}
