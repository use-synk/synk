import type { RunStatus, TriggerType } from "@synk-ai/shared";

export type Pagination = {
	page: number;
	pageSize: number;
};

export type PaginatedResult<T> = {
	items: readonly T[];
	total: number;
};

export type RepositoryListItem = {
	id: string;
	installationId: string;
	fullName: string;
	defaultBranch: string;
	status: "active" | "archived" | "removed";
	isActive: boolean;
	updatedAt: Date;
};

export type RepositoryPatch = {
	isActive?: boolean;
};

export type RepositoryDetail = {
	id: string;
	installationId: string;
	fullName: string;
	defaultBranch: string;
	status: "active" | "archived" | "removed";
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type ManualRunRepositoryState = {
	status: "active" | "archived" | "removed";
	isActive: boolean;
	defaultBranch: string;
	installationId: string;
};

export type RunListItem = {
	id: string;
	status: RunStatus;
	triggerType: TriggerType;
	triggerRef: string;
	triggerCommitSha: string;
	triggerMergeRequestNumber: number | null;
	triggerPrTitle: string | null;
	triggerSourceBranch: string | null;
	triggerTargetBranch: string | null;
	triggerPrAuthorName: string | null;
	triggerPrAuthorUsername: string | null;
	triggerPrAuthorAvatarUrl: string | null;
	docsAffected: boolean | null;
	suggestionsCount: number;
	docPrUrl: string | null;
	errorCode: string | null;
	errorMessage: string | null;
	error: string | null;
	createdAt: Date;
	startedAt: Date | null;
	completedAt: Date | null;
};

export type RunListFilter = Pagination & {
	status?: readonly RunStatus[];
};

export type RunDetail = {
	id: string;
	repositoryId: string;
	status: RunStatus;
	triggerType: TriggerType;
	triggerRef: string;
	triggerCommitSha: string;
	triggerMergeRequestNumber: number | null;
	triggerPrTitle: string | null;
	triggerSourceBranch: string | null;
	triggerTargetBranch: string | null;
	triggerPrAuthorName: string | null;
	triggerPrAuthorUsername: string | null;
	triggerPrAuthorAvatarUrl: string | null;
	triggerMeta: unknown;
	result: unknown;
	docsAffected: boolean | null;
	suggestionsCount: number;
	docPrNumber: number | null;
	docPrUrl: string | null;
	tokenUsage: unknown;
	errorCode: string | null;
	errorMessage: string | null;
	error: string | null;
	attemptCount: number;
	queuedAt: Date;
	startedAt: Date | null;
	completedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
	steps: readonly RunStepDetail[];
};

export type RunStepDetail = {
	id: string;
	runId: string;
	attemptNumber: number;
	stepKey: string;
	status: "running" | "completed" | "failed";
	result: unknown;
	errorCode: string | null;
	errorMessage: string | null;
	startedAt: Date | null;
	completedAt: Date | null;
	durationMs: number | null;
	createdAt: Date;
	updatedAt: Date;
};
