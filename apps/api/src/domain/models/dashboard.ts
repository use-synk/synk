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
	docsConfig: unknown;
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
	docsConfig: unknown;
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
	docsAffected: boolean | null;
	docPrUrl: string | null;
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
	triggerMeta: unknown;
	result: unknown;
	docsAffected: boolean | null;
	docPrNumber: number | null;
	docPrUrl: string | null;
	tokenUsage: unknown;
	error: string | null;
	attemptCount: number;
	queuedAt: Date;
	startedAt: Date | null;
	completedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
};
