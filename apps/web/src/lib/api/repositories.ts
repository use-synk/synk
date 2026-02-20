import {
	useMutation,
	useQuery,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";

import { apiFetch } from "./client";
import {
	repositoryListResponseSchema,
	repositorySingleResponseSchema,
	type RepositoryListResponse,
	type RepositorySingleResponse,
} from "./schemas";

// -- Types --

export type PaginationParams = {
	page?: number;
	pageSize?: number;
};

export type PatchRepositoryBody = {
	is_active?: boolean;
	docs_config?: Record<string, unknown>;
};

// -- Query key factories --

export const repositoryKeys = {
	all: () => ["repositories"] as const,
	list: (installationId: string, params?: PaginationParams) =>
		[...repositoryKeys.all(), "list", installationId, params] as const,
} as const;

// -- Fetch functions --

export const fetchInstallationRepositories = async (
	installationId: string,
	params?: PaginationParams,
	init?: RequestInit,
): Promise<RepositoryListResponse> => {
	const searchParams = new URLSearchParams();
	if (params?.page !== undefined) searchParams.set("page", String(params.page));
	if (params?.pageSize !== undefined) searchParams.set("page_size", String(params.pageSize));
	const qs = searchParams.toString();

	const data = await apiFetch(
		`/api/v1/dashboard/installations/${installationId}/repos${qs ? `?${qs}` : ""}`,
		init,
	);
	return repositoryListResponseSchema.parse(data);
};

export const patchRepository = async (
	repoId: string,
	body: PatchRepositoryBody,
	init?: RequestInit,
): Promise<RepositorySingleResponse> => {
	const data = await apiFetch(`/api/v1/dashboard/repos/${repoId}`, {
		...init,
		method: "PATCH",
		body: JSON.stringify(body),
	});
	return repositorySingleResponseSchema.parse(data);
};

// -- React Query hooks --

export const useInstallationRepositories = (
	installationId: string,
	params?: PaginationParams,
): UseQueryResult<RepositoryListResponse, Error> =>
	useQuery({
		queryKey: repositoryKeys.list(installationId, params),
		queryFn: () => fetchInstallationRepositories(installationId, params),
	});

export const usePatchRepository = (): UseMutationResult<
	RepositorySingleResponse,
	Error,
	{ repoId: string; body: PatchRepositoryBody }
> =>
	useMutation({
		mutationFn: ({ repoId, body }) => patchRepository(repoId, body),
	});
