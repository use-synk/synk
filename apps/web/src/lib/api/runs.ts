import {
	useMutation,
	useQuery,
	type UseMutationResult,
	type UseQueryResult,
} from "@tanstack/react-query";

import { apiFetch } from "./client";
import {
	manualRunAcceptedResponseSchema,
	runDetailResponseSchema,
	runListResponseSchema,
	type ManualRunAcceptedResponse,
	type RunDetailResponse,
	type RunListResponse,
	type RunStatus,
} from "./schemas";

// -- Types --

export type RunListParams = {
	page?: number;
	pageSize?: number;
	status?: RunStatus[];
};

export type CreateManualRunBody = {
	commit_sha: string;
	ref?: string;
};

// -- Query key factories --

export const runKeys = {
	all: () => ["runs"] as const,
	list: (repoId: string, params?: RunListParams) =>
		[...runKeys.all(), "list", repoId, params] as const,
	detail: (runId: string) => [...runKeys.all(), "detail", runId] as const,
} as const;

// -- Fetch functions --

export const fetchRepositoryRuns = async (
	repoId: string,
	params?: RunListParams,
	init?: RequestInit,
): Promise<RunListResponse> => {
	const searchParams = new URLSearchParams();
	if (params?.page !== undefined) searchParams.set("page", String(params.page));
	if (params?.pageSize !== undefined) searchParams.set("page_size", String(params.pageSize));
	if (params?.status !== undefined && params.status.length > 0) {
		searchParams.set("status", params.status.join(","));
	}
	const qs = searchParams.toString();

	const data = await apiFetch(`/api/repos/${repoId}/runs${qs ? `?${qs}` : ""}`, init);
	return runListResponseSchema.parse(data);
};

export const fetchRunDetail = async (
	runId: string,
	init?: RequestInit,
): Promise<RunDetailResponse> => {
	const data = await apiFetch(`/api/runs/${runId}`, init);
	return runDetailResponseSchema.parse(data);
};

export const createManualRun = async (
	repoId: string,
	body: CreateManualRunBody,
	init?: RequestInit,
): Promise<ManualRunAcceptedResponse> => {
	const data = await apiFetch(`/api/repos/${repoId}/runs`, {
		...init,
		method: "POST",
		body: JSON.stringify(body),
	});
	return manualRunAcceptedResponseSchema.parse(data);
};

// -- React Query hooks --

export const useRepositoryRuns = (
	repoId: string,
	params?: RunListParams,
): UseQueryResult<RunListResponse, Error> =>
	useQuery({
		queryKey: runKeys.list(repoId, params),
		queryFn: () => fetchRepositoryRuns(repoId, params),
	});

export const useRunDetail = (runId: string): UseQueryResult<RunDetailResponse, Error> =>
	useQuery({
		queryKey: runKeys.detail(runId),
		queryFn: () => fetchRunDetail(runId),
	});

export const useCreateManualRun = (): UseMutationResult<
	ManualRunAcceptedResponse,
	Error,
	{ repoId: string; body: CreateManualRunBody }
> =>
	useMutation({
		mutationFn: ({ repoId, body }) => createManualRun(repoId, body),
	});
