import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AnalyzeChangesEnqueuer } from "../queues/analyze-changes.js";
import type { AppEnv } from "../types.js";

const GITHUB_SIGNATURE_PREFIX = "sha256=";
const GITHUB_DELETED_REF_SHA = "0000000000000000000000000000000000000000";
const PROVIDER_GITHUB = "github" as const;
const INSTALLATION_ACTIVE = "active" as const;
const INSTALLATION_SUSPENDED = "suspended" as const;
const INSTALLATION_DELETED = "deleted" as const;
const REPOSITORY_ACTIVE = "active" as const;
const REPOSITORY_REMOVED = "removed" as const;

type GitHubAccountPayload = {
	id?: number | undefined;
	login?: string | undefined;
	type?: string | undefined;
};

type GitHubInstallationPayload = {
	id?: number | undefined;
	account?: GitHubAccountPayload | undefined;
};

type GitHubRepositoryPayload = {
	id?: number | undefined;
};

const installationEventSchema = z.object({
	action: z.string().optional(),
	installation: z
		.object({
			id: z.number().int().optional(),
			account: z
				.object({
					id: z.number().int().optional(),
					login: z.string().optional(),
					type: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
});

const repositoryPayloadSchema = z.object({
	id: z.number().int().optional(),
	name: z.string().optional(),
	full_name: z.string().optional(),
	default_branch: z.string().optional(),
	owner: z
		.object({
			login: z.string().optional(),
		})
		.optional(),
});

const installationRepositoriesEventSchema = z.object({
	action: z.string().optional(),
	installation: z
		.object({
			id: z.number().int().optional(),
		})
		.optional(),
	repositories_added: z.array(repositoryPayloadSchema).optional(),
	repositories_removed: z.array(repositoryPayloadSchema).optional(),
});

const pushEventSchema = z.object({
	ref: z.string().optional(),
	after: z.string().optional(),
	installation: z
		.object({
			id: z.number().int().optional(),
		})
		.optional(),
	repository: z
		.object({
			id: z.number().int().optional(),
		})
		.optional(),
});

const pullRequestEventSchema = z.object({
	action: z.string().optional(),
	number: z.number().int().optional(),
	installation: z
		.object({
			id: z.number().int().optional(),
		})
		.optional(),
	repository: z
		.object({
			id: z.number().int().optional(),
		})
		.optional(),
	pull_request: z
		.object({
			merged: z.boolean().optional(),
			merge_commit_sha: z.string().nullable().optional(),
			base: z
				.object({
					ref: z.string().optional(),
				})
				.optional(),
			head: z
				.object({
					sha: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
});

type InstallationEventPayload = z.infer<typeof installationEventSchema>;
type InstallationRepositoriesEventPayload = z.infer<typeof installationRepositoriesEventSchema>;
type PushEventPayload = z.infer<typeof pushEventSchema>;
type PullRequestEventPayload = z.infer<typeof pullRequestEventSchema>;

type ActiveRepository = {
	id: string;
	installationId: string;
	defaultBranch: string;
};

export type GitHubInstallationRepository = {
	id: number;
	name: string;
	full_name: string;
	default_branch: string;
	owner: {
		login: string;
	};
};

export type ListInstallationRepositories = (
	installationId: number,
) => Promise<readonly GitHubInstallationRepository[]>;

type PersistableRepository = {
	providerRepositoryId: string;
	ownerLogin: string;
	name: string;
	fullName: string;
	defaultBranch: string;
};

type RepositoryHydrationResult = {
	complete: readonly PersistableRepository[];
	missingProviderRepositoryIds: readonly string[];
};

export type WebhookDatabase = {
	providerInstallation: {
		findUnique(args: {
			where: {
				provider_providerInstallationId: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
				};
			};
			select: {
				id: true;
				organizationId: true;
			};
		}): Promise<{ id: string; organizationId: string } | null>;
		upsert(args: {
			where: {
				provider_providerInstallationId: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
				};
			};
			create: {
				organizationId: string;
				provider: "github" | "gitlab" | "bitbucket";
				providerInstallationId: string;
				providerAccountId: string;
				accountLogin: string;
				accountType: string;
				status: "active" | "suspended" | "deleted";
				deletedAt: Date | null;
			};
			update: {
				providerAccountId: string;
				accountLogin: string;
				accountType: string;
				status: "active" | "suspended" | "deleted";
				deletedAt: Date | null;
			};
		}): Promise<{ id: string }>;
		updateMany(args: {
			where: {
				provider: "github" | "gitlab" | "bitbucket";
				providerInstallationId: string;
			};
			data: {
				status: "active" | "suspended" | "deleted";
				deletedAt: Date;
			};
		}): Promise<{ count: number }>;
	};
	providerRepository: {
		upsert(args: {
			where: {
				provider_providerRepositoryId: {
					provider: "github" | "gitlab" | "bitbucket";
					providerRepositoryId: string;
				};
			};
			create: {
				installationId: string;
				provider: "github" | "gitlab" | "bitbucket";
				providerRepositoryId: string;
				ownerLogin: string;
				name: string;
				fullName: string;
				defaultBranch: string;
				status: "active" | "archived" | "removed";
				isActive: boolean;
				lastSyncedAt: Date | null;
			};
			update: {
				installationId: string;
				ownerLogin: string;
				name: string;
				fullName: string;
				defaultBranch: string;
				status: "active" | "archived" | "removed";
				isActive: boolean;
				lastSyncedAt: Date | null;
			};
		}): Promise<unknown>;
		findFirst(args: {
			where: {
				provider: "github" | "gitlab" | "bitbucket";
				providerRepositoryId: string;
				isActive: boolean;
				status: "active" | "archived" | "removed";
				installation: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
					status: "active" | "suspended" | "deleted";
				};
			};
			select: {
				id: true;
				installationId: true;
				defaultBranch: true;
			};
		}): Promise<ActiveRepository | null>;
		updateMany(args: {
			where: {
				installation: {
					provider: "github" | "gitlab" | "bitbucket";
					providerInstallationId: string;
				};
				providerRepositoryId?: {
					in: readonly string[];
				};
			};
			data: {
				status: "active" | "archived" | "removed";
				isActive: boolean;
			};
		}): Promise<{ count: number }>;
	};
};

type RouteOptions = {
	db: WebhookDatabase;
	webhookSecret: string;
	installationOrganizationId?: string;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	listInstallationRepositories: ListInstallationRepositories;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const getProviderInstallationId = (installation?: GitHubInstallationPayload): string | null => {
	if (installation?.id === undefined) {
		return null;
	}
	return String(installation.id);
};

const getProviderRepositoryId = (repository?: GitHubRepositoryPayload): string | null => {
	if (repository?.id === undefined) {
		return null;
	}
	return String(repository.id);
};

const toPersistableRepository = (
	repository: z.infer<typeof repositoryPayloadSchema>,
): PersistableRepository | null => {
	const providerRepositoryId = repository.id !== undefined ? String(repository.id) : null;
	const ownerLogin = repository.owner?.login?.trim() ? repository.owner.login.trim() : null;
	const name = repository.name?.trim() ? repository.name.trim() : null;
	const fullName = repository.full_name?.trim() ? repository.full_name.trim() : null;
	const defaultBranch = repository.default_branch?.trim() ? repository.default_branch.trim() : null;

	if (
		providerRepositoryId === null ||
		ownerLogin === null ||
		name === null ||
		fullName === null ||
		defaultBranch === null
	) {
		return null;
	}

	return {
		providerRepositoryId,
		ownerLogin,
		name,
		fullName,
		defaultBranch,
	};
};

const toPersistableRepositoryFromGitHub = (
	repository: GitHubInstallationRepository,
): PersistableRepository => ({
	providerRepositoryId: String(repository.id),
	ownerLogin: repository.owner.login,
	name: repository.name,
	fullName: repository.full_name,
	defaultBranch: repository.default_branch,
});

const chunkArray = <TValue>(values: readonly TValue[], size: number): readonly TValue[][] => {
	const chunks: TValue[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
};

const upsertRepository = async (
	db: Pick<WebhookDatabase, "providerRepository">,
	installationId: string,
	repository: PersistableRepository,
): Promise<void> => {
	await db.providerRepository.upsert({
		where: {
			provider_providerRepositoryId: {
				provider: PROVIDER_GITHUB,
				providerRepositoryId: repository.providerRepositoryId,
			},
		},
		create: {
			installationId,
			provider: PROVIDER_GITHUB,
			providerRepositoryId: repository.providerRepositoryId,
			ownerLogin: repository.ownerLogin,
			name: repository.name,
			fullName: repository.fullName,
			defaultBranch: repository.defaultBranch,
			status: REPOSITORY_ACTIVE,
			isActive: true,
			lastSyncedAt: new Date(),
		},
		update: {
			installationId,
			ownerLogin: repository.ownerLogin,
			name: repository.name,
			fullName: repository.fullName,
			defaultBranch: repository.defaultBranch,
			status: REPOSITORY_ACTIVE,
			isActive: true,
			lastSyncedAt: new Date(),
		},
	});
};

const upsertRepositories = async (
	db: Pick<WebhookDatabase, "providerRepository">,
	installationId: string,
	repositories: readonly PersistableRepository[],
): Promise<void> => {
	const upsertBatchSize = 25;

	for (const batch of chunkArray(repositories, upsertBatchSize)) {
		await Promise.all(batch.map((repository) => upsertRepository(db, installationId, repository)));
	}
};

const getRepositoryIds = (
	repositories: readonly z.infer<typeof repositoryPayloadSchema>[],
): readonly string[] => {
	return repositories
		.map((repository) => (repository.id !== undefined ? String(repository.id) : null))
		.filter((repositoryId): repositoryId is string => repositoryId !== null);
};

const hydrateRepositories = async (
	repositories: readonly z.infer<typeof repositoryPayloadSchema>[],
	providerInstallationNumericId: number | undefined,
	listInstallationRepositories: ListInstallationRepositories,
): Promise<RepositoryHydrationResult> => {
	const completeRepositories: PersistableRepository[] = [];
	const repositoriesMissingDetails: string[] = [];

	for (const repository of repositories) {
		const persistableRepository = toPersistableRepository(repository);
		if (persistableRepository !== null) {
			completeRepositories.push(persistableRepository);
			continue;
		}

		if (repository.id !== undefined) {
			repositoriesMissingDetails.push(String(repository.id));
		}
	}

	if (repositoriesMissingDetails.length === 0 || providerInstallationNumericId === undefined) {
		return {
			complete: completeRepositories,
			missingProviderRepositoryIds: repositoriesMissingDetails,
		};
	}

	const missingIds = new Set(repositoriesMissingDetails);
	const syncedRepositories = await listInstallationRepositories(providerInstallationNumericId);
	for (const repository of syncedRepositories) {
		const repositoryId = String(repository.id);
		if (!missingIds.has(repositoryId)) {
			continue;
		}

		completeRepositories.push(toPersistableRepositoryFromGitHub(repository));
		missingIds.delete(repositoryId);
	}

	return {
		complete: completeRepositories,
		missingProviderRepositoryIds: [...missingIds],
	};
};

const markRepositoriesAsRemoved = async (
	db: Pick<WebhookDatabase, "providerRepository">,
	providerInstallationId: string,
	repositoryIds: readonly string[],
): Promise<void> => {
	if (repositoryIds.length === 0) {
		return;
	}

	await db.providerRepository.updateMany({
		where: {
			installation: {
				provider: PROVIDER_GITHUB,
				providerInstallationId,
			},
			providerRepositoryId: {
				in: repositoryIds,
			},
		},
		data: {
			status: REPOSITORY_REMOVED,
			isActive: false,
		},
	});
};

const syncInstallationRepositories = async (
	options: RouteOptions,
	installationId: string,
	providerInstallationNumericId: number,
): Promise<void> => {
	const repositories = await options.listInstallationRepositories(providerInstallationNumericId);
	const persistableRepositories = repositories.map(toPersistableRepositoryFromGitHub);
	await upsertRepositories(options.db, installationId, persistableRepositories);
};

const installationIdentityFromAccount = (
	account: GitHubAccountPayload | undefined,
	providerInstallationId: string,
): { accountId: string; accountLogin: string; accountType: string } => {
	const accountId = account?.id !== undefined ? String(account.id) : providerInstallationId;
	const accountLogin = account?.login?.trim() ? account.login.trim() : `github-${accountId}`;
	const accountType = account?.type?.trim() ? account.type.trim() : "User";

	return {
		accountId,
		accountLogin,
		accountType,
	};
};

const hasValidSignature = (
	signatureHeader: string | undefined,
	rawBody: string,
	webhookSecret: string,
): boolean => {
	if (signatureHeader === undefined || !signatureHeader.startsWith(GITHUB_SIGNATURE_PREFIX)) {
		return false;
	}

	const providedDigest = signatureHeader.slice(GITHUB_SIGNATURE_PREFIX.length);
	const expectedDigest = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

	const providedBuffer = Buffer.from(providedDigest, "hex");
	const expectedBuffer = Buffer.from(expectedDigest, "hex");

	if (providedBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return timingSafeEqual(providedBuffer, expectedBuffer);
};

const parseJsonPayload = (rawBody: string): Record<string, unknown> | null => {
	try {
		const payload = JSON.parse(rawBody);
		return isObject(payload) ? payload : null;
	} catch {
		return null;
	}
};

const findActiveRepository = async (
	db: Pick<WebhookDatabase, "providerRepository">,
	providerInstallationId: string,
	providerRepositoryId: string,
): Promise<ActiveRepository | null> => {
	return db.providerRepository.findFirst({
		where: {
			provider: PROVIDER_GITHUB,
			providerRepositoryId,
			isActive: true,
			status: REPOSITORY_ACTIVE,
			installation: {
				provider: PROVIDER_GITHUB,
				providerInstallationId,
				status: INSTALLATION_ACTIVE,
			},
		},
		select: {
			id: true,
			installationId: true,
			defaultBranch: true,
		},
	});
};

const handleInstallationEvent = async (
	payload: InstallationEventPayload,
	options: RouteOptions,
): Promise<void> => {
	const providerInstallationId = getProviderInstallationId(payload.installation);
	if (providerInstallationId === null) {
		return;
	}

	if (payload.action === "deleted") {
		await options.db.providerInstallation.updateMany({
			where: {
				provider: PROVIDER_GITHUB,
				providerInstallationId,
			},
			data: {
				status: INSTALLATION_DELETED,
				deletedAt: new Date(),
			},
		});

		await options.db.providerRepository.updateMany({
			where: {
				installation: {
					provider: PROVIDER_GITHUB,
					providerInstallationId,
				},
			},
			data: {
				status: REPOSITORY_REMOVED,
				isActive: false,
			},
		});

		return;
	}

	const existingInstallation = await options.db.providerInstallation.findUnique({
		where: {
			provider_providerInstallationId: {
				provider: PROVIDER_GITHUB,
				providerInstallationId,
			},
		},
		select: {
			id: true,
			organizationId: true,
		},
	});
	const organizationId = existingInstallation?.organizationId ?? options.installationOrganizationId;
	if (organizationId === undefined) {
		return;
	}

	const installationIdentity = installationIdentityFromAccount(
		payload.installation?.account,
		providerInstallationId,
	);

	const status = payload.action === "suspend" ? INSTALLATION_SUSPENDED : INSTALLATION_ACTIVE;

	const installation = await options.db.providerInstallation.upsert({
		where: {
			provider_providerInstallationId: {
				provider: PROVIDER_GITHUB,
				providerInstallationId,
			},
		},
		create: {
			organizationId,
			provider: PROVIDER_GITHUB,
			providerInstallationId,
			providerAccountId: installationIdentity.accountId,
			accountLogin: installationIdentity.accountLogin,
			accountType: installationIdentity.accountType,
			status,
			deletedAt: null,
		},
		update: {
			providerAccountId: installationIdentity.accountId,
			accountLogin: installationIdentity.accountLogin,
			accountType: installationIdentity.accountType,
			status,
			deletedAt: null,
		},
	});

	if (payload.action !== "created" || payload.installation?.id === undefined) {
		return;
	}

	await syncInstallationRepositories(options, installation.id, payload.installation.id);
};

const handleInstallationRepositoriesEvent = async (
	payload: InstallationRepositoriesEventPayload,
	options: RouteOptions,
): Promise<void> => {
	const providerInstallationId = getProviderInstallationId(payload.installation);
	if (providerInstallationId === null) {
		return;
	}

	const installation = await options.db.providerInstallation.findUnique({
		where: {
			provider_providerInstallationId: {
				provider: PROVIDER_GITHUB,
				providerInstallationId,
			},
		},
		select: {
			id: true,
			organizationId: true,
		},
	});
	if (installation === null) {
		return;
	}

	if (payload.action === "added") {
		const hydratedRepositories = await hydrateRepositories(
			payload.repositories_added ?? [],
			payload.installation?.id,
			options.listInstallationRepositories,
		);
		if (hydratedRepositories.complete.length > 0) {
			await upsertRepositories(options.db, installation.id, hydratedRepositories.complete);
		}

		if (hydratedRepositories.missingProviderRepositoryIds.length > 0) {
			throw new HTTPException(422, {
				message: `Missing repository details for installation_repositories.added: ${hydratedRepositories.missingProviderRepositoryIds.join(",")}`,
			});
		}
		return;
	}

	if (payload.action === "removed") {
		const repositoryIds = getRepositoryIds(payload.repositories_removed ?? []);
		await markRepositoriesAsRemoved(options.db, providerInstallationId, repositoryIds);
	}
};

const handlePushEvent = async (payload: PushEventPayload, options: RouteOptions): Promise<void> => {
	const providerInstallationId = getProviderInstallationId(payload.installation);
	const providerRepositoryId = getProviderRepositoryId(payload.repository);
	const ref = payload.ref;
	const commitSha = payload.after;

	if (
		providerInstallationId === null ||
		providerRepositoryId === null ||
		ref === undefined ||
		commitSha === undefined ||
		commitSha === GITHUB_DELETED_REF_SHA
	) {
		return;
	}

	const repository = await findActiveRepository(
		options.db,
		providerInstallationId,
		providerRepositoryId,
	);
	if (repository === null) {
		return;
	}

	if (ref !== `refs/heads/${repository.defaultBranch}`) {
		return;
	}

	await options.enqueueAnalyzeChanges({
		installationId: repository.installationId,
		repositoryId: repository.id,
		trigger: {
			type: "push",
			ref,
			commitSha,
		},
	});
};

const handlePullRequestEvent = async (
	payload: PullRequestEventPayload,
	options: RouteOptions,
): Promise<void> => {
	if (payload.action !== "closed" || payload.pull_request?.merged !== true) {
		return;
	}

	const providerInstallationId = getProviderInstallationId(payload.installation);
	const providerRepositoryId = getProviderRepositoryId(payload.repository);
	const baseRef = payload.pull_request.base?.ref;
	const prNumber = payload.number;
	const commitSha = payload.pull_request.merge_commit_sha ?? payload.pull_request.head?.sha;

	if (
		providerInstallationId === null ||
		providerRepositoryId === null ||
		baseRef === undefined ||
		prNumber === undefined ||
		commitSha === undefined
	) {
		return;
	}

	const repository = await findActiveRepository(
		options.db,
		providerInstallationId,
		providerRepositoryId,
	);
	if (repository === null) {
		return;
	}

	if (baseRef !== repository.defaultBranch) {
		return;
	}

	await options.enqueueAnalyzeChanges({
		installationId: repository.installationId,
		repositoryId: repository.id,
		trigger: {
			type: "merge",
			ref: `refs/heads/${baseRef}`,
			commitSha,
			prNumber,
		},
	});
};

export const createGitHubWebhookRoute = (options: RouteOptions): Hono<AppEnv> => {
	const route = new Hono<AppEnv>();

	route.post("/github", async (c) => {
		const rawBody = await c.req.text();
		const signatureHeader = c.req.header("x-hub-signature-256");

		if (!hasValidSignature(signatureHeader, rawBody, options.webhookSecret)) {
			return c.json({ error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } }, 401);
		}

		const eventType = c.req.header("x-github-event");
		if (eventType === undefined) {
			return c.json(
				{ error: { code: "BAD_REQUEST", message: "Missing X-GitHub-Event header" } },
				400,
			);
		}

		const payload = parseJsonPayload(rawBody);
		if (payload === null) {
			return c.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON payload" } }, 400);
		}

		if (eventType === "installation") {
			const parsed = installationEventSchema.safeParse(payload);
			if (parsed.success) {
				await handleInstallationEvent(parsed.data, options);
			}
			return c.json({ status: "ok" }, 200);
		}

		if (eventType === "push") {
			const parsed = pushEventSchema.safeParse(payload);
			if (parsed.success) {
				await handlePushEvent(parsed.data, options);
			}
			return c.json({ status: "ok" }, 200);
		}

		if (eventType === "pull_request") {
			const parsed = pullRequestEventSchema.safeParse(payload);
			if (parsed.success) {
				await handlePullRequestEvent(parsed.data, options);
			}
			return c.json({ status: "ok" }, 200);
		}

		if (eventType === "installation_repositories") {
			const parsed = installationRepositoriesEventSchema.safeParse(payload);
			if (parsed.success) {
				await handleInstallationRepositoriesEvent(parsed.data, options);
			}
			return c.json({ status: "ok" }, 200);
		}

		return c.json({ status: "ignored" }, 200);
	});

	return route;
};
