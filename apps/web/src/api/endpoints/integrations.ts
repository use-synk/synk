import z from "zod";
import { ValidationError } from "../errors";
import type { ApiQuery } from "../types";

const initiateGithubInstallationBodySchema = z.object({
	organizationId: z.string().uuid(),
});

export function initiateGithubInstallation(
	props: z.infer<typeof initiateGithubInstallationBodySchema>,
) {
	const parsed = initiateGithubInstallationBodySchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	return {
		url: "/integrations/github/install/init",
		init: {
			method: "POST",
			body: JSON.stringify(parsed.data),
		},
		response: z.object({
			data: z.object({
				redirectUrl: z.string().url(),
			}),
		}),
		key: ["integrations", "github", "install", "init"],
	} satisfies ApiQuery;
}

const completeGithubInstallationPropsSchema = z.object({
	installationId: z.number().int().positive(),
	state: z.string().min(1),
	setupAction: z.enum(["install", "update"]),
});

export function completeGithubInstallation(
	props: z.infer<typeof completeGithubInstallationPropsSchema>,
) {
	const parsed = completeGithubInstallationPropsSchema.safeParse(props);
	if (!parsed.success) {
		throw new ValidationError("params", parsed.error.issues);
	}

	const params = new URLSearchParams({
		installation_id: parsed.data.installationId.toString(),
		state: parsed.data.state,
		setup_action: parsed.data.setupAction,
	});

	return {
		url: `/integrations/github/install/callback?${params.toString()}`,
		init: {
			method: "GET",
		},
		response: z.object({
			data: z.object({
				organizationSlug: z.string(),
			}),
		}),
		key: [
			"integrations",
			"github",
			"install",
			"callback",
			`${parsed.data.installationId}`,
			parsed.data.state,
			parsed.data.setupAction,
		],
	} satisfies ApiQuery;
}
