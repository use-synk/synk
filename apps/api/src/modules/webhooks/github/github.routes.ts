import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { AppEnv } from "../../../types.js";
import { GitHubWebhookService, type GitHubWebhookServiceOptions } from "./github.service.js";

const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";
const GITHUB_EVENT_HEADER = "x-github-event";
const GITHUB_DELIVERY_HEADER = "x-github-delivery";
const GITHUB_PROVIDER = "github" as const;

export type GitHubWebhookRouteOptions = GitHubWebhookServiceOptions;

export function createGitHubWebhookRoutes(options: GitHubWebhookRouteOptions): Hono<AppEnv> {
	const route = new Hono<AppEnv>();
	const service = new GitHubWebhookService(options);

	/**
	 * POST /webhooks/github
	 *
	 * Handles GitHub webhooks.
	 */
	route.post("/", async (ctx) => {
		const rawBody = await ctx.req.text();
		const signatureHeader = ctx.req.header(GITHUB_SIGNATURE_HEADER);
		const deliveryId = ctx.req.header(GITHUB_DELIVERY_HEADER);
		const payloadHash = hashPayload(rawBody);

		const isValidSignature = await service.validateSignature(signatureHeader, rawBody);

		const event = ctx.req.header(GITHUB_EVENT_HEADER);
		if (event === undefined) {
			return ctx.json(
				{ error: { code: "BAD_REQUEST", message: "Missing X-GitHub-Event header" } },
				400,
			);
		}

		const payload = parseJsonPayload(rawBody);
		try {
			await createDeliveryLog({
				deliveryId,
				event,
				payload,
				payloadHash,
				isValidSignature,
				options,
			});
		} catch {
			// Delivery logging is best-effort and must not block webhook processing.
		}

		if (!isValidSignature) {
			await markDelivery({
				deliveryId,
				options,
				status: "failed",
				error: "Invalid webhook signature",
			});
			return ctx.json(
				{ error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } },
				401,
			);
		}

		if (payload === null) {
			await markDelivery({
				deliveryId,
				options,
				status: "failed",
				error: "Invalid JSON payload",
			});
			return ctx.json(
				{ error: { code: "BAD_REQUEST", message: "Invalid JSON payload" } },
				400,
			);
		}

		try {
			const result = await service.handleEvent(event, payload);
			await markDelivery({
				deliveryId,
				options,
				status: result.ok ? "processed" : "ignored",
				...(result.ok ? {} : { error: result.message }),
			});
			return ctx.json({ status: result }, 200);
		} catch (error) {
			try {
				await markDelivery({
					deliveryId,
					options,
					status: "failed",
					error: error instanceof Error ? error.message : "Unknown error",
				});
			} catch {
				// Preserve the original event handling error if delivery logging fails.
			}
			throw error;
		}
	});

	return route;
}

const parseJsonPayload = (rawBody: string): Record<string, unknown> | null => {
	try {
		const parsed = JSON.parse(rawBody);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? parsed
			: null;
	} catch {
		return null;
	}
};

const hashPayload = (value: string): string => createHash("sha256").update(value).digest("hex");

const extractProviderIds = (
	payload: Record<string, unknown> | null,
): { providerInstallationId?: string; providerRepositoryId?: string } => {
	if (payload === null) {
		return {};
	}

	const installation = payload.installation;
	const repository = payload.repository;
	const installationId =
		typeof installation === "object" &&
		installation !== null &&
		"id" in installation &&
		(typeof installation.id === "number" || typeof installation.id === "string")
			? String(installation.id)
			: undefined;
	const repositoryId =
		typeof repository === "object" &&
		repository !== null &&
		"id" in repository &&
		(typeof repository.id === "number" || typeof repository.id === "string")
			? String(repository.id)
			: undefined;

	return {
		...(installationId === undefined ? {} : { providerInstallationId: installationId }),
		...(repositoryId === undefined ? {} : { providerRepositoryId: repositoryId }),
	};
};

const createDeliveryLog = async ({
	deliveryId,
	event,
	payload,
	payloadHash,
	isValidSignature,
	options,
}: {
	deliveryId: string | undefined;
	event: string;
	payload: Record<string, unknown> | null;
	payloadHash: string;
	isValidSignature: boolean;
	options: GitHubWebhookRouteOptions;
}): Promise<void> => {
	if (deliveryId === undefined || options.webhookEventLogRepository === undefined) {
		return;
	}

	const ids = extractProviderIds(payload);
	await options.webhookEventLogRepository.createDelivery({
		provider: GITHUB_PROVIDER,
		deliveryId,
		eventType: event,
		signatureValid: isValidSignature,
		payloadHash,
		receivedAt: new Date(),
		...ids,
	});
};

const markDelivery = async ({
	deliveryId,
	options,
	status,
	error,
}: {
	deliveryId: string | undefined;
	options: GitHubWebhookRouteOptions;
	status: "processed" | "ignored" | "failed";
	error?: string;
}): Promise<void> => {
	if (deliveryId === undefined || options.webhookEventLogRepository === undefined) {
		return;
	}
	await options.webhookEventLogRepository.markProcessed({
		provider: GITHUB_PROVIDER,
		deliveryId,
		status,
		...(error === undefined ? {} : { error }),
	});
};
