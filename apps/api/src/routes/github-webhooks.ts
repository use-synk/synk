import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
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
};

type GitHubRepositoryPayload = {
	id?: number | undefined;
};

const installationEventSchema = z.object({
	action: z.string().optional(),
	installation: z
		.object({
			id: z.number().int().optional(),
		})
		.optional(),
	account: z
		.object({
			id: z.number().int().optional(),
			login: z.string().optional(),
			type: z.string().optional(),
		})
		.optional(),
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
type PushEventPayload = z.infer<typeof pushEventSchema>;
type PullRequestEventPayload = z.infer<typeof pullRequestEventSchema>;

type ActiveRepository = {
	id: string;
	installationId: string;
	defaultBranch: string;
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
				organizationId: true;
			};
		}): Promise<{ organizationId: string } | null>;
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
		}): Promise<unknown>;
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
			organizationId: true,
		},
	});
	const organizationId = existingInstallation?.organizationId ?? options.installationOrganizationId;
	if (organizationId === undefined) {
		return;
	}

	const installationIdentity = installationIdentityFromAccount(
		payload.account,
		providerInstallationId,
	);

	const status = payload.action === "suspend" ? INSTALLATION_SUSPENDED : INSTALLATION_ACTIVE;

	await options.db.providerInstallation.upsert({
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

		return c.json({ status: "ignored" }, 200);
	});

	return route;
};
