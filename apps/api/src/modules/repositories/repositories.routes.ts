import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { DashboardServiceContract } from "../../domain/services";
import { createRequireAuthMiddleware } from "../../middleware/auth";
import type { AuthenticatedAppEnv, RouteContext } from "../../types";
import {
	listInstallationRepositoriesQuerySchema,
	patchRepositoryBodySchema,
} from "./repositories.schemas";

export function createRepositoriesRoutes({
	auth,
	dashboardService,
}: RouteContext & {
	dashboardService: DashboardServiceContract;
}) {
	const router = new Hono<AuthenticatedAppEnv>();

	router.use("*", createRequireAuthMiddleware(auth));

	router.patch("/:repositoryId", async (ctx) => {
		const userId = ctx.get("user").id;
		const repositoryId = ctx.req.param("repositoryId");

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			throw new HTTPException(400, { message: "Invalid JSON payload" });
		}

		const bodyResult = patchRepositoryBodySchema.safeParse(body);
		if (!bodyResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(bodyResult.error) });
		}

		const result = await dashboardService.patchRepository({
			repositoryId,
			userId,
			...(bodyResult.data.isActive === undefined ? {} : { isActive: bodyResult.data.isActive }),
		});

		return ctx.json({
			data: {
				...result,
				createdAt: result.createdAt.toISOString(),
				updatedAt: result.updatedAt.toISOString(),
			},
		});
	});

	router.get("/installations/:installationId", async (ctx) => {
		const userId = ctx.get("user").id;
		const installationId = ctx.req.param("installationId");

		const queryResult = listInstallationRepositoriesQuerySchema.safeParse(ctx.req.query());
		if (!queryResult.success) {
			throw new HTTPException(400, { message: z.prettifyError(queryResult.error) });
		}

		const { page = 1, pageSize = 10 } = queryResult.data;

		const result = await dashboardService.listInstallationRepositories({
			installationId,
			userId,
			pagination: { page, pageSize },
		});

		return ctx.json({
			data: result.items.map((repository) => ({
				...repository,
				updatedAt: repository.updatedAt.toISOString(),
			})),
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
