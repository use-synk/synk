import { createHmac, timingSafeEqual } from "node:crypto";
import { HTTPException } from "hono/http-exception";
import type z from "zod";
import type {
	WebhookEventLogRepository,
	WebhookRepository,
} from "../../../domain/ports/index.js";
import type { AnalyzeChangesEnqueuer } from "../../../queues/analyze-changes.js";
import {
	installationEventSchema,
	installationRepositoriesEventSchema,
	pullRequestEventSchema,
	pushEventSchema,
} from "./github.schemas.js";
import {
	getRepositoryIds,
	hydrateRepositories,
	markRepositoriesAsRemoved,
	syncInstallationRepositories,
	upsertRepositories,
} from "./repository-helpers.js";
import type { ListInstallationRepositories } from "./types.js";

const PROVIDER_GITHUB = "github" as const;
const INSTALLATION_ACTIVE = "active" as const;
const INSTALLATION_SUSPENDED = "suspended" as const;
const GITHUB_DELETED_REF_SHA = "0000000000000000000000000000000000000000";

type EventHandleResult = { ok: true } | { ok: false; message: string };

export type GitHubWebhookServiceOptions = {
	webhookSecret: string;
	installationOrganizationId?: string;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	listInstallationRepositories: ListInstallationRepositories;
	webhookRepository: WebhookRepository;
	webhookEventLogRepository?: WebhookEventLogRepository;
};

export class GitHubWebhookService {
	private readonly GITHUB_SIGNATURE_PREFIX = "sha256=";
	private readonly SIGN_ALGORITHM = "sha256";

	constructor(private readonly options: GitHubWebhookServiceOptions) {}

	/**
	 * Validates the signature of a webhook payload.
	 *
	 * Uses a timing-safe comparison to verify the HMAC-SHA256 signature and
	 * prevent timing attacks.
	 *
	 * @param header - The X-Hub-Signature-256 header from the webhook request.
	 * @param body - The raw body string of the webhook request.
	 *
	 * @returns True if the signature is valid, false otherwise.
	 */
	async validateSignature(header: string | undefined, body: string): Promise<boolean> {
		if (header === undefined || !header.startsWith(this.GITHUB_SIGNATURE_PREFIX)) {
			return false;
		}

		const providedDigest = header.slice(this.GITHUB_SIGNATURE_PREFIX.length);
		const expectedDigest = createHmac(this.SIGN_ALGORITHM, this.options.webhookSecret)
			.update(body)
			.digest("hex");

		const providedBuffer = Buffer.from(providedDigest, "hex");
		const expectedBuffer = Buffer.from(expectedDigest, "hex");

		if (providedBuffer.length !== expectedBuffer.length) {
			return false;
		}

		return timingSafeEqual(providedBuffer, expectedBuffer);
	}

	async handleEvent(event: string, payload: unknown): Promise<EventHandleResult> {
		switch (event) {
			case "installation":
				return this.handleInstallationEvent(payload);
			case "installation_repositories":
				return this.handleInstallationRepositoriesEvent(payload);
			case "push":
				return this.handlePushEvent(payload);
			case "pull_request":
				return this.handlePullRequestEvent(payload);
			default:
				return { ok: false, message: `Unsupported event: ${event}` };
		}
	}

	/* ===============================================================
	 *                         PRIVATE METHODS
	 * =============================================================== */

	private async handleInstallationEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = installationEventSchema.safeParse(payload);
		if (!parseRes.success) {
			return { ok: false, message: "Invalid payload for installation event." };
		}

		const { action, installation } = parseRes.data;
		const providerInstallationId = this.getProviderInstallationId(installation);
		if (providerInstallationId === null) {
			return { ok: false, message: "Installation ID is required." };
		}

		if (action === "deleted") {
			try {
				await this.handleDeleteInstallation(providerInstallationId);
				return { ok: true };
			} catch {
				return { ok: false, message: "Failed to handle delete installation." };
			}
		}

		const existing = await this.options.webhookRepository.findInstallation({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
		});

		const organizationId = existing?.organizationId ?? this.options.installationOrganizationId;
		if (organizationId === undefined) {
			return { ok: true };
		}

		const identity = this.installationIdentityFromPayload(parseRes.data, providerInstallationId);
		if (identity === null) {
			return { ok: false, message: "Invalid payload for installation event." };
		}

		const status = action === "suspend" ? INSTALLATION_SUSPENDED : INSTALLATION_ACTIVE;
		const upserted = await this.options.webhookRepository.upsertInstallation({
			organizationId,
			provider: PROVIDER_GITHUB,
			providerInstallationId,
			providerAccountId: identity.accountId,
			accountLogin: identity.accountLogin,
			accountType: identity.accountType,
			status,
			deletedAt: null,
		});

		if (action !== "created" || installation?.id === undefined) {
			return { ok: true };
		}

		await syncInstallationRepositories(
			this.options.webhookRepository,
			this.options.listInstallationRepositories,
			upserted.id,
			installation.id,
		);

		return { ok: true };
	}

	private async handleInstallationRepositoriesEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = installationRepositoriesEventSchema.safeParse(payload);
		if (!parseRes.success) {
			return { ok: false, message: "Invalid payload for installation_repositories event." };
		}

		const { action, installation } = parseRes.data;
		const providerInstallationId = this.getProviderInstallationId(installation);
		if (providerInstallationId === null) {
			return { ok: false, message: "Installation ID is required." };
		}

		const databaseInstallation = await this.options.webhookRepository.findInstallation({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
		});
		if (databaseInstallation === null) {
			return { ok: true };
		}

		if (action === "added") {
			const hydrated = await hydrateRepositories(
				parseRes.data.repositories_added ?? [],
				installation?.id,
				this.options.listInstallationRepositories,
			);
			if (hydrated.complete.length > 0) {
				await upsertRepositories(
					this.options.webhookRepository,
					databaseInstallation.id,
					hydrated.complete,
				);
			}
			if (hydrated.missingProviderRepositoryIds.length > 0) {
				throw new HTTPException(422, {
					message: `Missing repository details for installation_repositories.added: ${hydrated.missingProviderRepositoryIds.join(",")}`,
				});
			}
			return { ok: true };
		}

		if (action === "removed") {
			const ids = getRepositoryIds(parseRes.data.repositories_removed ?? []);
			await markRepositoriesAsRemoved(this.options.webhookRepository, providerInstallationId, ids);
		}

		return { ok: true };
	}

	private async handlePushEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = pushEventSchema.safeParse(payload);
		if (!parseRes.success) {
			return { ok: false, message: "Invalid payload for push event." };
		}

		const { installation, repository, ref, after: commitSha } = parseRes.data;
		const providerInstallationId = this.getProviderInstallationId(installation);
		const providerRepositoryId = this.getProviderRepositoryId(repository);

		if (
			providerInstallationId === null ||
			providerRepositoryId === null ||
			ref === undefined ||
			commitSha === undefined ||
			commitSha === GITHUB_DELETED_REF_SHA
		) {
			return { ok: true };
		}

		const repo = await this.options.webhookRepository.findActiveRepository({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
			providerRepositoryId,
		});
		if (repo === null) return { ok: true };
		if (ref !== `refs/heads/${repo.defaultBranch}`) return { ok: true };

		await this.options.enqueueAnalyzeChanges({
			installationId: repo.installationId,
			repositoryId: repo.id,
			trigger: { type: "push", ref, commitSha },
		});

		return { ok: true };
	}

	private async handlePullRequestEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = pullRequestEventSchema.safeParse(payload);
		if (!parseRes.success) {
			return { ok: false, message: "Invalid payload for pull_request event." };
		}

		const { action, number: prNumber, installation, repository, pull_request } = parseRes.data;
		if (action !== "closed" || pull_request?.merged !== true) return { ok: true };

		const providerInstallationId = this.getProviderInstallationId(installation);
		const providerRepositoryId = this.getProviderRepositoryId(repository);
		const baseRef = pull_request.base?.ref;
		const commitSha = pull_request.merge_commit_sha ?? pull_request.head?.sha;

		if (
			providerInstallationId === null ||
			providerRepositoryId === null ||
			baseRef === undefined ||
			prNumber === undefined ||
			commitSha === undefined
		) {
			return { ok: true };
		}

		const repo = await this.options.webhookRepository.findActiveRepository({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
			providerRepositoryId,
		});
		if (repo === null) return { ok: true };
		if (baseRef !== repo.defaultBranch) return { ok: true };

		await this.options.enqueueAnalyzeChanges({
			installationId: repo.installationId,
			repositoryId: repo.id,
			trigger: {
				type: "merge",
				ref: `refs/heads/${baseRef}`,
				commitSha,
				prNumber,
			},
		});

		return { ok: true };
	}

	/**
	 * Handles the deletion of a GitHub installation.
	 *
	 * Updates the installation status to deleted and deactivates all repositories
	 * connected to the installation.
	 *
	 * @throws {Error} - If the installation status or repository updates fail.
	 */
	private async handleDeleteInstallation(providerInstallationId: string): Promise<void> {
		await this.options.webhookRepository.markInstallationDeleted({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
		});
	}

	// ===============================================================
	//                         PRIVATE HELPERS
	// ===============================================================

	private getProviderInstallationId(installation?: {
		id?: number | string | undefined;
	}): string | null {
		return installation?.id !== undefined ? String(installation.id) : null;
	}

	private getProviderRepositoryId(repository?: { id?: number | undefined }): string | null {
		return repository?.id !== undefined ? String(repository.id) : null;
	}

	private installationIdentityFromPayload(
		payload: z.infer<typeof installationEventSchema>,
		providerInstallationId: string,
	) {
		const { installation } = payload;
		if (!installation?.account) return null;
		const { account } = installation;

		const accountId = account.id;
		const login = account.login?.trim();
		const type = account.type?.trim();

		return {
			accountId: accountId ? String(accountId) : providerInstallationId,
			accountLogin: login ?? `github-${accountId}`,
			accountType: type ?? "User",
		};
	}
}
