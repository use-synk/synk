import { createHash } from "node:crypto";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { AppEnv } from "../../../types";
import { GitHubWebhookService, type GitHubWebhookServiceOptions } from "./github.service";

const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";
const GITHUB_EVENT_HEADER = "x-github-event";
const GITHUB_DELIVERY_HEADER = "x-github-delivery";
const GITHUB_PROVIDER = "github" as const;

export type GitHubWebhookRouteOptions = GitHubWebhookServiceOptions;

export function createGitHubWebhookRoutes(options: GitHubWebhookRouteOptions): OpenAPIHono<AppEnv> {
	const route = new OpenAPIHono<AppEnv>();
	const service = new GitHubWebhookService(options);
	const webhookRoute = createRoute({
		method: "post",
		path: "/",
		tags: ["webhooks"],
		operationId: "handleGithubWebhook",
		request: {
			headers: z.object({
				"x-hub-signature-256": z.string().optional(),
				"x-github-event": z.string(),
				"x-github-delivery": z.string().optional(),
				"x-request-id": z.string().optional(),
			}),
			body: {
				required: true,
				content: {
					"application/json": {
						schema: z.unknown(),
					},
				},
			},
		},
		responses: {
			200: { description: "Webhook event processed or ignored" },
			400: { description: "Invalid webhook payload or headers" },
			401: { description: "Invalid webhook signature" },
		},
	});

	/**
	 * POST /webhooks/github
	 *
	 * Handles GitHub webhooks.
	 */
	route.openapi(webhookRoute, async (ctx) => {
		const logger = ctx.get("logger");
		const requestId = ctx.get("requestId");
		const rawBody = await ctx.req.text();
		const signatureHeader = ctx.req.header(GITHUB_SIGNATURE_HEADER);
		const deliveryId = ctx.req.header(GITHUB_DELIVERY_HEADER);
		const payloadHash = hashPayload(rawBody);
		logger?.info(
			{
				requestId,
				deliveryId: deliveryId ?? null,
				bodySize: rawBody.length,
			},
			"github webhook request received",
		);

		const isValidSignature = await service.validateSignature(signatureHeader, rawBody);
		logger?.info(
			{
				requestId,
				deliveryId: deliveryId ?? null,
				signaturePresent: signatureHeader !== undefined,
				signatureValid: isValidSignature,
			},
			"github webhook signature validated",
		);

		const event = ctx.req.header(GITHUB_EVENT_HEADER);
		if (event === undefined) {
			logger?.warn(
				{
					requestId,
					deliveryId: deliveryId ?? null,
				},
				"github webhook rejected: missing x-github-event header",
			);
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
				logger: logger ?? undefined,
			});
		} catch {
			// Delivery logging is best-effort and must not block webhook processing.
			logger?.warn(
				{
					requestId,
					deliveryId: deliveryId ?? null,
					event,
				},
				"github webhook delivery log creation failed (best effort)",
			);
		}

		if (!isValidSignature) {
			await markDelivery({
				deliveryId,
				options,
				status: "failed",
				error: "Invalid webhook signature",
				logger: logger ?? undefined,
			});
			logger?.warn(
				{
					requestId,
					deliveryId: deliveryId ?? null,
					event,
				},
				"github webhook rejected: invalid signature",
			);
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
				logger: logger ?? undefined,
			});
			logger?.warn(
				{
					requestId,
					deliveryId: deliveryId ?? null,
					event,
				},
				"github webhook rejected: invalid json payload",
			);
			return ctx.json({ error: { code: "BAD_REQUEST", message: "Invalid JSON payload" } }, 400);
		}

		try {
			logger?.info(
				{
					requestId,
					deliveryId: deliveryId ?? null,
					event,
				},
				"github webhook dispatching event handler",
			);
			const result = await service.handleEvent(event, payload);
			await markDelivery({
				deliveryId,
				options,
				status: result.ok ? "processed" : "ignored",
				...(result.ok ? {} : { error: result.message }),
				logger: logger ?? undefined,
			});
			logger?.info(
				{
					requestId,
					deliveryId: deliveryId ?? null,
					event,
					result,
				},
				"github webhook handled",
			);
			return ctx.json({ status: result }, 200);
		} catch (error) {
			try {
				await markDelivery({
					deliveryId,
					options,
					status: "failed",
					error: error instanceof Error ? error.message : "Unknown error",
					logger: logger ?? undefined,
				});
			} catch {
				// Preserve the original event handling error if delivery logging fails.
				logger?.warn(
					{
						requestId,
						deliveryId: deliveryId ?? null,
						event,
					},
					"github webhook delivery mark failed after handler error",
				);
			}
			logger?.error(
				{
					err: error,
					requestId,
					deliveryId: deliveryId ?? null,
					event,
				},
				"github webhook handler failed",
			);
			throw error;
		}
	});

	return route;
}

const parseJsonPayload = (rawBody: string): Record<string, unknown> | null => {
	try {
		const parsed = JSON.parse(rawBody);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
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
	logger,
}: {
	deliveryId: string | undefined;
	event: string;
	payload: Record<string, unknown> | null;
	payloadHash: string;
	isValidSignature: boolean;
	options: GitHubWebhookRouteOptions;
	logger?: AppEnv["Variables"]["logger"];
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
	logger?.debug(
		{
			deliveryId,
			event,
		},
		"github webhook delivery log created",
	);
};

const markDelivery = async ({
	deliveryId,
	options,
	status,
	error,
	logger,
}: {
	deliveryId: string | undefined;
	options: GitHubWebhookRouteOptions;
	status: "processed" | "ignored" | "failed";
	error?: string;
	logger?: AppEnv["Variables"]["logger"];
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
	logger?.debug(
		{
			deliveryId,
			status,
			error: error ?? null,
		},
		"github webhook delivery marked",
	);
};
