import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type { AppEnv } from "../types.js";

const SESSION_COOKIE_NAMES = [
	"__Secure-better-auth.session_token",
	"better-auth.session_token",
] as const;
const SESSION_COOKIE_NAME_SET = new Set<string>(SESSION_COOKIE_NAMES);
const runStatusSchema = z.enum(["queued", "running", "completed", "skipped", "failed", "canceled"]);

const installationParamsSchema = z.object({ installationId: z.uuid() });
const repositoryParamsSchema = z.object({ repoId: z.uuid() });
const runParamsSchema = z.object({ runId: z.uuid() });

const paginationQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const listRunsQuerySchema = paginationQuerySchema.extend({
	status: z.string().optional(),
});

const patchRepositoryBodySchema = z
	.object({
		is_active: z.boolean().optional(),
		docs_config: z.record(z.string(), z.unknown()).optional(),
	})
	.refine((value) => value.is_active !== undefined || value.docs_config !== undefined, {
		message: "At least one of is_active or docs_config must be provided",
	});

const createManualRunBodySchema = z.object({
	commit_sha: z.string().regex(/^[a-fA-F0-9]{40}$/u, "commit_sha must be a 40-char SHA"),
	ref: z.string().min(1).optional(),
});

type RouteSession = {
	token: string;
	userId: string;
	expiresAt: Date;
};

type RepositoryAccessRecord = {
	id: string;
	installationId: string;
	defaultBranch: string;
	status: "active" | "archived" | "removed";
	isActive: boolean;
	docsConfig: unknown;
	updatedAt: Date;
};

type RunStatus = z.infer<typeof runStatusSchema>;

type RunSummary = {
	id: string;
	status: RunStatus;
	triggerType: "push" | "merge" | "manual";
	triggerRef: string;
	triggerCommitSha: string;
	docsAffected: boolean | null;
	docPrUrl: string | null;
	error: string | null;
	createdAt: Date;
	startedAt: Date | null;
	completedAt: Date | null;
};

type RunDetail = {
	id: string;
	repositoryId: string;
	status: RunStatus;
	triggerType: "push" | "merge" | "manual";
	triggerRef: string;
	triggerCommitSha: string;
	triggerMergeRequestNumber: number | null;
	triggerMeta: unknown;
	docsAffected: boolean | null;
	docPrNumber: number | null;
	docPrUrl: string | null;
	tokenUsage: unknown;
	error: string | null;
	attemptCount: number;
	result: unknown;
	queuedAt: Date;
	startedAt: Date | null;
	completedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

export type DashboardDatabase = {
	session: {
		findFirst(args: {
			where: { token: string };
			select: { token: true; userId: true; expiresAt: true };
		}): Promise<RouteSession | null>;
	};
	providerInstallation: {
		findFirst(args: {
			where: {
				id: string;
				organization: { members: { some: { userId: string } } };
			};
			select: { id: true };
		}): Promise<{ id: string } | null>;
	};
	providerRepository: {
		count(args: { where: { installationId: string } }): Promise<number>;
		findMany(args: {
			where: { installationId: string };
			orderBy: { updatedAt: "asc" | "desc" };
			skip: number;
			take: number;
			select: {
				id: true;
				installationId: true;
				fullName: true;
				defaultBranch: true;
				status: true;
				isActive: true;
				docsConfig: true;
				updatedAt: true;
			};
		}): Promise<
			readonly {
				id: string;
				installationId: string;
				fullName: string;
				defaultBranch: string;
				status: "active" | "archived" | "removed";
				isActive: boolean;
				docsConfig: unknown;
				updatedAt: Date;
			}[]
		>;
		findFirst(args: {
			where: {
				id: string;
				installation: {
					organization: {
						members: {
							some: {
								userId: string;
							};
						};
					};
				};
			};
			select: {
				id: true;
				installationId: true;
				defaultBranch: true;
				status: true;
				isActive: true;
				docsConfig: true;
				updatedAt: true;
			};
		}): Promise<RepositoryAccessRecord | null>;
		update(args: {
			where: { id: string };
			data: {
				isActive?: boolean;
				docsConfig?: Record<string, unknown>;
			};
			select: {
				id: true;
				installationId: true;
				defaultBranch: true;
				status: true;
				isActive: true;
				docsConfig: true;
				updatedAt: true;
			};
		}): Promise<RepositoryAccessRecord>;
	};
	analysisRun: {
		count(args: {
			where: {
				repositoryId: string;
				status?: {
					in: readonly RunStatus[];
				};
			};
		}): Promise<number>;
		findMany(args: {
			where: {
				repositoryId: string;
				status?: {
					in: readonly RunStatus[];
				};
			};
			orderBy: {
				createdAt: "asc" | "desc";
			};
			skip: number;
			take: number;
			select: {
				id: true;
				status: true;
				triggerType: true;
				triggerRef: true;
				triggerCommitSha: true;
				docsAffected: true;
				docPrUrl: true;
				error: true;
				createdAt: true;
				startedAt: true;
				completedAt: true;
			};
		}): Promise<readonly RunSummary[]>;
		findFirst(args: {
			where: {
				id: string;
				repository: {
					installation: {
						organization: {
							members: {
								some: {
									userId: string;
								};
							};
						};
					};
				};
			};
			select: {
				id: true;
				repositoryId: true;
				status: true;
				triggerType: true;
				triggerRef: true;
				triggerCommitSha: true;
				triggerMergeRequestNumber: true;
				triggerMeta: true;
				docsAffected: true;
				docPrNumber: true;
				docPrUrl: true;
				tokenUsage: true;
				error: true;
				attemptCount: true;
				result: true;
				queuedAt: true;
				startedAt: true;
				completedAt: true;
				createdAt: true;
				updatedAt: true;
			};
		}): Promise<RunDetail | null>;
	};
};

const parseSchema = <TValue>(result: z.ZodSafeParseResult<TValue>): TValue => {
	if (!result.success) {
		throw new HTTPException(400, { message: z.prettifyError(result.error) });
	}
	return result.data;
};

const parseSessionTokenFromCookie = (cookieHeader: string | undefined): string | null => {
	if (cookieHeader === undefined || cookieHeader.length === 0) {
		return null;
	}

	const cookieEntries = cookieHeader.split(";");
	for (const entry of cookieEntries) {
		const [rawName, ...rawValueParts] = entry.trim().split("=");
		if (rawName === undefined) {
			continue;
		}
		const name = rawName.trim();
		if (!SESSION_COOKIE_NAME_SET.has(name)) {
			continue;
		}
		const value = rawValueParts.join("=").trim();
		if (value.length > 0) {
			return decodeURIComponent(value);
		}
	}

	return null;
};

const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
	if (authorizationHeader === undefined) {
		return null;
	}

	const match = /^Bearer\s+(.+)$/u.exec(authorizationHeader.trim());
	const token = match?.[1]?.trim();
	return token === undefined || token.length === 0 ? null : token;
};

const resolveSessionToken = (headers: Headers): string | null => {
	const authorization = headers.get("authorization") ?? undefined;
	const fromAuthorization = extractBearerToken(authorization);
	if (fromAuthorization !== null) {
		return fromAuthorization;
	}
	return parseSessionTokenFromCookie(headers.get("cookie") ?? undefined);
};

const requireAuthenticatedUser = async (
	headers: Headers,
	db: DashboardDatabase,
): Promise<{ userId: string }> => {
	const sessionToken = resolveSessionToken(headers);
	if (sessionToken === null) {
		throw new HTTPException(401, { message: "Missing authentication session" });
	}

	const session = await db.session.findFirst({
		where: { token: sessionToken },
		select: {
			token: true,
			userId: true,
			expiresAt: true,
		},
	});
	if (session === null || session.expiresAt.getTime() <= Date.now()) {
		throw new HTTPException(401, { message: "Invalid or expired session" });
	}

	return { userId: session.userId };
};

const requireInstallationAccess = async (
	db: DashboardDatabase,
	installationId: string,
	userId: string,
): Promise<void> => {
	const installation = await db.providerInstallation.findFirst({
		where: {
			id: installationId,
			organization: {
				members: {
					some: {
						userId,
					},
				},
			},
		},
		select: { id: true },
	});
	if (installation === null) {
		throw new HTTPException(403, {
			message: "You do not have access to this installation",
		});
	}
};

const requireRepositoryAccess = async (
	db: DashboardDatabase,
	repositoryId: string,
	userId: string,
): Promise<RepositoryAccessRecord> => {
	const repository = await db.providerRepository.findFirst({
		where: {
			id: repositoryId,
			installation: {
				organization: {
					members: {
						some: {
							userId,
						},
					},
				},
			},
		},
		select: {
			id: true,
			installationId: true,
			defaultBranch: true,
			status: true,
			isActive: true,
			docsConfig: true,
			updatedAt: true,
		},
	});
	if (repository === null) {
		throw new HTTPException(403, {
			message: "You do not have access to this repository",
		});
	}
	return repository;
};

const parseRunStatusFilter = (rawStatus: string | undefined): readonly RunStatus[] | undefined => {
	if (rawStatus === undefined) {
		return undefined;
	}
	const values = rawStatus
		.split(",")
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
	if (values.length === 0) {
		return undefined;
	}
	return parseSchema(z.array(runStatusSchema).safeParse(values));
};

const extractAiReasoning = (
	result: unknown,
): { triage: string | null; generation: readonly { path: string; reasoning: string }[] } => {
	const parsedResult = z
		.object({
			triage: z
				.object({
					reasoning: z.string(),
				})
				.partial()
				.optional(),
			generation: z
				.array(
					z.object({
						path: z.string(),
						reasoning: z.string(),
					}),
				)
				.optional(),
		})
		.safeParse(result);
	if (!parsedResult.success) {
		return { triage: null, generation: [] };
	}

	return {
		triage: parsedResult.data.triage?.reasoning ?? null,
		generation: parsedResult.data.generation ?? [],
	};
};

const listInstallationRepositoriesHandler = (db: DashboardDatabase) => {
	return async (c: Context<AppEnv>) => {
		const auth = await requireAuthenticatedUser(c.req.raw.headers, db);
		const params = parseSchema(installationParamsSchema.safeParse(c.req.param()));
		const query = parseSchema(paginationQuerySchema.safeParse(c.req.query()));
		await requireInstallationAccess(db, params.installationId, auth.userId);

		const skip = (query.page - 1) * query.page_size;
		const [total, repositories] = await Promise.all([
			db.providerRepository.count({ where: { installationId: params.installationId } }),
			db.providerRepository.findMany({
				where: { installationId: params.installationId },
				orderBy: { updatedAt: "desc" },
				skip,
				take: query.page_size,
				select: {
					id: true,
					installationId: true,
					fullName: true,
					defaultBranch: true,
					status: true,
					isActive: true,
					docsConfig: true,
					updatedAt: true,
				},
			}),
		]);

		return c.json({
			data: repositories.map((repository) => ({
				id: repository.id,
				installation_id: repository.installationId,
				full_name: repository.fullName,
				default_branch: repository.defaultBranch,
				status: repository.status,
				is_active: repository.isActive,
				docs_config: repository.docsConfig,
				updated_at: repository.updatedAt.toISOString(),
			})),
			pagination: {
				page: query.page,
				page_size: query.page_size,
				total,
				total_pages: total === 0 ? 0 : Math.ceil(total / query.page_size),
			},
		});
	};
};

const patchRepositoryHandler = (db: DashboardDatabase) => {
	return async (c: Context<AppEnv>) => {
		const auth = await requireAuthenticatedUser(c.req.raw.headers, db);
		const params = parseSchema(repositoryParamsSchema.safeParse(c.req.param()));
		const requestBody = parseSchema(
			patchRepositoryBodySchema.safeParse(await c.req.json().catch(() => ({}))),
		);
		await requireRepositoryAccess(db, params.repoId, auth.userId);

		const data: { isActive?: boolean; docsConfig?: Record<string, unknown> } = {};
		if (requestBody.is_active !== undefined) {
			data.isActive = requestBody.is_active;
		}
		if (requestBody.docs_config !== undefined) {
			data.docsConfig = requestBody.docs_config;
		}

		const updated = await db.providerRepository.update({
			where: { id: params.repoId },
			data,
			select: {
				id: true,
				installationId: true,
				defaultBranch: true,
				status: true,
				isActive: true,
				docsConfig: true,
				updatedAt: true,
			},
		});

		return c.json({
			data: {
				id: updated.id,
				installation_id: updated.installationId,
				default_branch: updated.defaultBranch,
				status: updated.status,
				is_active: updated.isActive,
				docs_config: updated.docsConfig,
				updated_at: updated.updatedAt.toISOString(),
			},
		});
	};
};

const listRepositoryRunsHandler = (db: DashboardDatabase) => {
	return async (c: Context<AppEnv>) => {
		const auth = await requireAuthenticatedUser(c.req.raw.headers, db);
		const params = parseSchema(repositoryParamsSchema.safeParse(c.req.param()));
		const query = parseSchema(listRunsQuerySchema.safeParse(c.req.query()));
		await requireRepositoryAccess(db, params.repoId, auth.userId);
		const statusFilter = parseRunStatusFilter(query.status);

		const where = {
			repositoryId: params.repoId,
			...(statusFilter === undefined ? {} : { status: { in: statusFilter } }),
		};
		const skip = (query.page - 1) * query.page_size;
		const [total, runs] = await Promise.all([
			db.analysisRun.count({ where }),
			db.analysisRun.findMany({
				where,
				orderBy: { createdAt: "desc" },
				skip,
				take: query.page_size,
				select: {
					id: true,
					status: true,
					triggerType: true,
					triggerRef: true,
					triggerCommitSha: true,
					docsAffected: true,
					docPrUrl: true,
					error: true,
					createdAt: true,
					startedAt: true,
					completedAt: true,
				},
			}),
		]);

		return c.json({
			data: runs.map((run) => ({
				id: run.id,
				status: run.status,
				trigger_type: run.triggerType,
				trigger_ref: run.triggerRef,
				trigger_commit_sha: run.triggerCommitSha,
				docs_affected: run.docsAffected,
				doc_pr_url: run.docPrUrl,
				error: run.error,
				created_at: run.createdAt.toISOString(),
				started_at: run.startedAt?.toISOString() ?? null,
				completed_at: run.completedAt?.toISOString() ?? null,
			})),
			pagination: {
				page: query.page,
				page_size: query.page_size,
				total,
				total_pages: total === 0 ? 0 : Math.ceil(total / query.page_size),
			},
		});
	};
};

const getRunDetailHandler = (db: DashboardDatabase) => {
	return async (c: Context<AppEnv>) => {
		const auth = await requireAuthenticatedUser(c.req.raw.headers, db);
		const params = parseSchema(runParamsSchema.safeParse(c.req.param()));
		const run = await db.analysisRun.findFirst({
			where: {
				id: params.runId,
				repository: {
					installation: {
						organization: {
							members: {
								some: {
									userId: auth.userId,
								},
							},
						},
					},
				},
			},
			select: {
				id: true,
				repositoryId: true,
				status: true,
				triggerType: true,
				triggerRef: true,
				triggerCommitSha: true,
				triggerMergeRequestNumber: true,
				triggerMeta: true,
				docsAffected: true,
				docPrNumber: true,
				docPrUrl: true,
				tokenUsage: true,
				error: true,
				attemptCount: true,
				result: true,
				queuedAt: true,
				startedAt: true,
				completedAt: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (run === null) {
			throw new HTTPException(403, { message: "You do not have access to this run" });
		}

		const aiReasoning = extractAiReasoning(run.result);
		return c.json({
			data: {
				id: run.id,
				repository_id: run.repositoryId,
				status: run.status,
				trigger_type: run.triggerType,
				trigger_ref: run.triggerRef,
				trigger_commit_sha: run.triggerCommitSha,
				trigger_merge_request_number: run.triggerMergeRequestNumber,
				trigger_meta: run.triggerMeta,
				docs_affected: run.docsAffected,
				doc_pr_number: run.docPrNumber,
				doc_pr_url: run.docPrUrl,
				pr_link: run.docPrUrl,
				token_usage: run.tokenUsage,
				error: run.error,
				attempt_count: run.attemptCount,
				result: run.result,
				ai_reasoning: aiReasoning,
				queued_at: run.queuedAt.toISOString(),
				started_at: run.startedAt?.toISOString() ?? null,
				completed_at: run.completedAt?.toISOString() ?? null,
				created_at: run.createdAt.toISOString(),
				updated_at: run.updatedAt.toISOString(),
			},
		});
	};
};

const createManualRunHandler = (
	db: DashboardDatabase,
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer,
) => {
	return async (c: Context<AppEnv>) => {
		const auth = await requireAuthenticatedUser(c.req.raw.headers, db);
		const params = parseSchema(repositoryParamsSchema.safeParse(c.req.param()));
		const body = parseSchema(
			createManualRunBodySchema.safeParse(await c.req.json().catch(() => ({}))),
		);
		const repository = await requireRepositoryAccess(db, params.repoId, auth.userId);
		if (repository.status !== "active" || !repository.isActive) {
			throw new HTTPException(409, {
				message: "Cannot trigger a run for an inactive repository",
			});
		}

		const triggerRef = body.ref ?? `refs/heads/${repository.defaultBranch}`;
		await enqueueAnalyzeChanges({
			installationId: repository.installationId,
			repositoryId: repository.id,
			trigger: {
				type: "manual",
				ref: triggerRef,
				commitSha: body.commit_sha,
			},
		});

		return c.json(
			{
				data: {
					repository_id: repository.id,
					trigger_type: "manual",
					trigger_ref: triggerRef,
					trigger_commit_sha: body.commit_sha,
					accepted: true,
				},
			},
			202,
		);
	};
};

export const createDashboardRoute = (
	db: DashboardDatabase,
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer,
): Hono<AppEnv> => {
	const route = new Hono<AppEnv>();

	route.get("/installations/:installationId/repos", listInstallationRepositoriesHandler(db));
	route.patch("/repos/:repoId", patchRepositoryHandler(db));
	route.get("/repos/:repoId/runs", listRepositoryRunsHandler(db));
	route.get("/runs/:runId", getRunDetailHandler(db));
	route.post("/repos/:repoId/runs", createManualRunHandler(db, enqueueAnalyzeChanges));

	return route;
};
