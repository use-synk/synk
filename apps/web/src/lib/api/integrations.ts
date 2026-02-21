import { type UseMutationResult, useMutation } from "@tanstack/react-query";

import { apiFetch } from "./client";
import {
	type CompleteGitHubInstallationResponse,
	type InitiateGitHubInstallationResponse,
	completeGitHubInstallationResponseSchema,
	initiateGitHubInstallationResponseSchema,
} from "./schemas";

// -- Types --

export type InitiateGitHubInstallationBody = {
	organizationId: string;
};

export type CompleteGitHubInstallationParams = {
	installationId: number;
	state: string;
	setupAction: string;
};

// -- Query key factories --

export const integrationKeys = {
	all: () => ["integrations"] as const,
} as const;

// -- Fetch functions --

/**
 * Initiates the GitHub App installation flow. Requires CORS with credentials on
 * the API and cross-domain cookie attributes on the web app's Better Auth config.
 */
export const initiateGitHubInstallation = async (
	body: InitiateGitHubInstallationBody,
	init?: RequestInit,
): Promise<InitiateGitHubInstallationResponse> => {
	const data = await apiFetch("/api/v1/integrations/github/install/init", {
		...init,
		method: "POST",
		body: JSON.stringify(body),
	});
	return initiateGitHubInstallationResponseSchema.parse(data);
};

export const completeGitHubInstallation = async (
	params: CompleteGitHubInstallationParams,
	init?: RequestInit,
): Promise<CompleteGitHubInstallationResponse> => {
	const searchParams = new URLSearchParams({
		installation_id: String(params.installationId),
		state: params.state,
		setup_action: params.setupAction,
	});
	const data = await apiFetch(
		`/api/v1/integrations/github/install/callback?${searchParams.toString()}`,
		init,
	);
	return completeGitHubInstallationResponseSchema.parse(data);
};

// -- React Query hooks --

export const useInitiateGitHubInstallation = (): UseMutationResult<
	InitiateGitHubInstallationResponse,
	Error,
	InitiateGitHubInstallationBody
> =>
	useMutation({
		mutationFn: (body) => initiateGitHubInstallation(body),
	});
