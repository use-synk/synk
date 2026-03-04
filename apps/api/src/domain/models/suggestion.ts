export type SuggestionStatus = "pending" | "accepted" | "declined" | "superseded" | "stale" | "applied";

export type SuggestionDecision = "accept" | "decline" | "reset";

export type SuggestionListFilter = {
	page: number;
	pageSize: number;
	status?: SuggestionStatus[];
};

export type SuggestionSummary = {
	id: string;
	projectId: string;
	repositoryId: string;
	runId: string;
	docPath: string;
	status: SuggestionStatus;
	reasoning: string | null;
	fingerprint: string;
	supersedesSuggestionId: string | null;
	decidedByUserId: string | null;
	decidedAt: Date | null;
	decisionNote: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type SuggestionDetail = SuggestionSummary & {
	baseDocSha: string;
	beforeContent: string | null;
	proposedContent: string;
	appliedInBatchId: string | null;
};
