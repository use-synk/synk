import { createHmac, timingSafeEqual } from "node:crypto";
import type z from "zod";
import type { WebhookEventLogRepository, WebhookRepository } from "../../../domain/ports/index";
import type { Logger } from "../../../logger";
import type { AnalyzeChangesEnqueuer } from "../../../queues/analyze-changes";
import { INSTALLATION_ACTIVE, INSTALLATION_SUSPENDED, PROVIDER_GITHUB } from "./constants";
import {
	installationEventSchema,
	installationRepositoriesEventSchema,
	pullRequestEventSchema,
	pushEventSchema,
} from "./github.schemas";
import {
	getRepositoryIds,
	hydrateRepositories,
	markRepositoriesAsRemoved,
	syncInstallationRepositories,
	upsertRepositories,
} from "./repository-helpers";
import type { ListInstallationRepositories } from "./types";

const GITHUB_DELETED_REF_SHA = "0000000000000000000000000000000000000000";

type EventHandleResult = { ok: true } | { ok: false; message: string };

export type GitHubWebhookServiceOptions = {
	webhookSecret: string;
	enqueueAnalyzeChanges: AnalyzeChangesEnqueuer;
	listInstallationRepositories: ListInstallationRepositories;
	webhookRepository: WebhookRepository;
	webhookEventLogRepository?: WebhookEventLogRepository;
	logger?: Logger;
};

export class GitHubWebhookService {
	private readonly GITHUB_SIGNATURE_PREFIX = "sha256=";
	private readonly SIGN_ALGORITHM = "sha256";

	constructor(private readonly options: GitHubWebhookServiceOptions) {}

	private logInfo(context: Record<string, unknown>, message: string): void {
		this.options.logger?.info(context, message);
	}

	private logWarn(context: Record<string, unknown>, message: string): void {
		this.options.logger?.warn(context, message);
	}

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
		this.logInfo({ event }, "github webhook event dispatch");
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
				this.logInfo({ event }, "github webhook event ignored: unsupported event");
				return { ok: false, message: `Unsupported event: ${event}` };
		}
	}

	/* ===============================================================
	 *                         PRIVATE METHODS
	 * =============================================================== */

	private async handleInstallationEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = installationEventSchema.safeParse(payload);
		if (!parseRes.success) {
			this.logWarn({ event: "installation" }, "github webhook invalid installation payload");
			return { ok: false, message: "Invalid payload for installation event." };
		}

		const { action, installation } = parseRes.data;
		const providerInstallationId = this.getProviderInstallationId(installation);
		if (providerInstallationId === null) {
			this.logWarn({ event: "installation", action }, "github webhook missing installation id");
			return { ok: false, message: "Installation ID is required." };
		}
		this.logInfo(
			{ event: "installation", action, providerInstallationId },
			"github webhook installation event received",
		);

		if (action === "deleted") {
			try {
				await this.handleDeleteInstallation(providerInstallationId);
				this.logInfo(
					{ event: "installation", action, providerInstallationId },
					"github webhook installation marked deleted",
				);
				return { ok: true };
			} catch {
				this.logWarn(
					{ event: "installation", action, providerInstallationId },
					"github webhook installation delete handling failed",
				);
				return { ok: false, message: "Failed to handle delete installation." };
			}
		}

		const existing = await this.options.webhookRepository.findInstallation({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
		});

		const organizationId = existing?.organizationId;
		if (organizationId === undefined) {
			this.logInfo(
				{ event: "installation", action, providerInstallationId },
				"github webhook installation ignored: no linked organization",
			);
			return { ok: true };
		}

		const identity = this.installationIdentityFromPayload(parseRes.data, providerInstallationId);
		if (identity === null) {
			this.logWarn(
				{ event: "installation", action, providerInstallationId, organizationId },
				"github webhook installation payload missing identity",
			);
			return { ok: false, message: "Invalid payload for installation event." };
		}

		const status = action === "suspend" ? INSTALLATION_SUSPENDED : INSTALLATION_ACTIVE;
		let upserted: { id: string };
		try {
			upserted = await this.options.webhookRepository.upsertInstallation({
				organizationId,
				provider: PROVIDER_GITHUB,
				providerInstallationId,
				providerAccountId: identity.accountId,
				accountLogin: identity.accountLogin,
				accountType: identity.accountType,
				status,
				deletedAt: null,
			});
		} catch {
			this.logWarn(
				{ event: "installation", action, providerInstallationId, organizationId },
				"github webhook installation upsert failed",
			);
			return { ok: false, message: "Failed to upsert installation: organization not found." };
		}
		this.logInfo(
			{ event: "installation", action, providerInstallationId, organizationId },
			"github webhook installation upserted",
		);

		if (action !== "created" || installation?.id === undefined) {
			return { ok: true };
		}

		await syncInstallationRepositories(
			this.options.webhookRepository,
			this.options.listInstallationRepositories,
			upserted.id,
			installation.id,
		);
		this.logInfo(
			{ event: "installation", action, providerInstallationId, organizationId },
			"github webhook installation repositories synced",
		);

		return { ok: true };
	}

	private async handleInstallationRepositoriesEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = installationRepositoriesEventSchema.safeParse(payload);
		if (!parseRes.success) {
			this.logWarn(
				{ event: "installation_repositories" },
				"github webhook invalid installation_repositories payload",
			);
			return { ok: false, message: "Invalid payload for installation_repositories event." };
		}

		const { action, installation } = parseRes.data;
		const providerInstallationId = this.getProviderInstallationId(installation);
		if (providerInstallationId === null) {
			this.logWarn(
				{ event: "installation_repositories", action },
				"github webhook missing installation id for installation_repositories event",
			);
			return { ok: false, message: "Installation ID is required." };
		}
		this.logInfo(
			{ event: "installation_repositories", action, providerInstallationId },
			"github webhook installation_repositories event received",
		);

		const databaseInstallation = await this.options.webhookRepository.findInstallation({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
		});
		if (databaseInstallation === null) {
			this.logInfo(
				{ event: "installation_repositories", action, providerInstallationId },
				"github webhook installation_repositories ignored: installation not found in db",
			);
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
				this.logWarn(
					{
						event: "installation_repositories",
						action,
						providerInstallationId,
						missingProviderRepositoryIds: hydrated.missingProviderRepositoryIds,
					},
					"github webhook installation_repositories added handling incomplete",
				);
				return {
					ok: false,
					message: `Missing repository details for installation_repositories.added: ${hydrated.missingProviderRepositoryIds.join(",")}`,
				};
			}
			this.logInfo(
				{
					event: "installation_repositories",
					action,
					providerInstallationId,
					addedCount: hydrated.complete.length,
				},
				"github webhook installation_repositories added handled",
			);
			return { ok: true };
		}

		if (action === "removed") {
			const ids = getRepositoryIds(parseRes.data.repositories_removed ?? []);
			await markRepositoriesAsRemoved(this.options.webhookRepository, providerInstallationId, ids);
			this.logInfo(
				{
					event: "installation_repositories",
					action,
					providerInstallationId,
					removedCount: ids.length,
				},
				"github webhook installation_repositories removed handled",
			);
		}

		return { ok: true };
	}

	private async handlePushEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = pushEventSchema.safeParse(payload);
		if (!parseRes.success) {
			this.logWarn({ event: "push" }, "github webhook invalid push payload");
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
			this.logInfo({ event: "push" }, "github webhook push ignored: missing required fields or deleted ref");
			return { ok: true };
		}

		const repo = await this.options.webhookRepository.findActiveRepository({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
			providerRepositoryId,
		});
		if (repo === null) {
			this.logInfo(
				{
					event: "push",
					providerInstallationId,
					providerRepositoryId,
					commitSha,
					ref,
				},
				"github webhook push ignored: repository not active",
			);
			return { ok: true };
		}
		if (ref !== `refs/heads/${repo.defaultBranch}`) {
			this.logInfo(
				{
					event: "push",
					repositoryId: repo.id,
					commitSha,
					ref,
					defaultBranch: repo.defaultBranch,
				},
				"github webhook push ignored: non-default branch",
			);
			return { ok: true };
		}
		this.logInfo(
			{
				event: "push",
				repositoryId: repo.id,
				installationId: repo.installationId,
				commitSha,
				ref,
				defaultBranch: repo.defaultBranch,
			},
			"github webhook push matched enqueue conditions",
		);
		await this.options.enqueueAnalyzeChanges({
			installationId: repo.installationId,
			repositoryId: repo.id,
			trigger: {
				type: "push",
				ref,
				commitSha,
			},
		});
		this.logInfo(
			{
				event: "push",
				repositoryId: repo.id,
				installationId: repo.installationId,
				commitSha,
				ref,
			},
			"github webhook push enqueued analyze-changes",
		);

		return { ok: true };
	}

	private async handlePullRequestEvent(payload: unknown): Promise<EventHandleResult> {
		const parseRes = pullRequestEventSchema.safeParse(payload);
		if (!parseRes.success) {
			this.logWarn({ event: "pull_request" }, "github webhook invalid pull_request payload");
			return { ok: false, message: "Invalid payload for pull_request event." };
		}

		const { action, number: prNumber, installation, repository, pull_request } = parseRes.data;
		if (action !== "closed" || pull_request?.merged !== true) {
			this.logInfo(
				{
					event: "pull_request",
					action,
					prNumber,
					merged: pull_request?.merged ?? false,
				},
				"github webhook pull_request ignored: not a merged close event",
			);
			return { ok: true };
		}

		const providerInstallationId = this.getProviderInstallationId(installation);
		const providerRepositoryId = this.getProviderRepositoryId(repository);
		const baseRef = pull_request.base?.ref;
		const headRef = pull_request.head?.ref;
		const commitSha = pull_request.merge_commit_sha ?? pull_request.head?.sha;
		const prAuthorName = pull_request.user?.name;
		const prAuthorUsername = pull_request.user?.login;
		const prAuthorAvatarUrl = pull_request.user?.avatar_url;
		const prTitle = pull_request.title;

		if (
			providerInstallationId === null ||
			providerRepositoryId === null ||
			baseRef === undefined ||
			headRef === undefined ||
			prNumber === undefined ||
			commitSha === undefined ||
			prAuthorUsername === undefined
		) {
			this.logWarn(
				{
					event: "pull_request",
					action,
					prNumber,
				},
				"github webhook pull_request ignored: missing required fields",
			);
			return { ok: true };
		}

		const repo = await this.options.webhookRepository.findActiveRepository({
			provider: PROVIDER_GITHUB,
			providerInstallationId,
			providerRepositoryId,
		});
		if (repo === null) {
			this.logInfo(
				{
					event: "pull_request",
					action,
					prNumber,
					providerInstallationId,
					providerRepositoryId,
					commitSha,
				},
				"github webhook pull_request ignored: repository not active",
			);
			return { ok: true };
		}
		if (baseRef !== repo.defaultBranch) {
			this.logInfo(
				{
					event: "pull_request",
					action,
					prNumber,
					repositoryId: repo.id,
					baseRef,
					defaultBranch: repo.defaultBranch,
					commitSha,
				},
				"github webhook pull_request ignored: merged into non-default branch",
			);
			return { ok: true };
		}
		this.logInfo(
			{
				event: "pull_request",
				action,
				prNumber,
				repositoryId: repo.id,
				installationId: repo.installationId,
				baseRef,
				headRef,
				commitSha,
			},
			"github webhook pull_request matched enqueue conditions",
		);

		await this.options.enqueueAnalyzeChanges({
			installationId: repo.installationId,
			repositoryId: repo.id,
			trigger: {
				type: "merge",
				ref: `refs/heads/${baseRef}`,
				commitSha,
				prNumber,
				prTitle,
				sourceBranch: headRef,
				targetBranch: baseRef,
				prAuthorName,
				prAuthorUsername,
				prAuthorAvatarUrl,
			},
		});
		this.logInfo(
			{
				event: "pull_request",
				action,
				prNumber,
				repositoryId: repo.id,
				installationId: repo.installationId,
				commitSha,
			},
			"github webhook pull_request enqueued analyze-changes",
		);

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
