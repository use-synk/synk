import { Hono } from "hono";
import type { AppEnv } from "../../../types.js";
import { GitHubWebhookService, type GitHubWebhookServiceOptions } from "./github.service.js";

const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";
const GITHUB_EVENT_HEADER = "x-github-event";

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

		const isValidSignature = await service.validateSignature(signatureHeader, rawBody);
		if (!isValidSignature) {
			return ctx.json(
				{ error: { code: "UNAUTHORIZED", message: "Invalid webhook signature" } },
				401,
			);
		}

		const event = ctx.req.header(GITHUB_EVENT_HEADER);
		if (event === undefined) {
			return ctx.json(
				{ error: { code: "BAD_REQUEST", message: "Missing X-GitHub-Event header" } },
				400,
			);
		}

		const payload = parseJsonPayload(rawBody);
		if (payload === null) {
			return ctx.json(
				{ error: { code: "BAD_REQUEST", message: "Invalid JSON payload" } },
				400,
			);
		}

		const result = await service.handleEvent(event, payload);
		return ctx.json({ status: result }, 200);
	});

	return route;
}

const parseJsonPayload = (rawBody: string): Record<string, unknown> | null => {
	try {
		const parsed = JSON.parse(rawBody);
		return typeof parsed === "object" && parsed !== null ? parsed : null;
	} catch {
		return null;
	}
};
