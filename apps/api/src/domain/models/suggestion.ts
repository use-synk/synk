export type SuggestionStatus = "pending" | "accepted" | "declined" | "superseded" | "stale" | "applied";

export type SuggestionDecision = "accept" | "decline" | "reset";

export type SuggestionListFilter = {
	page: number;
	pageSize: number;
	status?: SuggestionStatus[];
};

export type SuggestionDecider = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

export type SuggestionSummary = {
	id: string;
	readableId: number;
	projectId: string;
	repositoryId: string;
	runId: string;
	docPath: string;
	baseDocSha: string;
	status: SuggestionStatus;
	title: string | null;
	reasoning: string | null;
	fingerprint: string;
	diffAdditions: number;
	diffDeletions: number;
	supersedesSuggestionId: string | null;
	decidedByUserId: string | null;
	decidedByUser: SuggestionDecider | null;
	decidedAt: Date | null;
	decisionNote: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type SuggestionDetail = SuggestionSummary & {
	beforeContent: string | null;
	proposedContent: string;
	appliedInBatchId: string | null;
};

export type CreateSuggestionsPrExcludedReason =
	| "file-missing"
	| "base-sha-mismatch"
	| "already-applied";

export type CreateSuggestionsPrExcludedItem = {
	suggestionId: string;
	docPath: string;
	reason: CreateSuggestionsPrExcludedReason;
};

export type CreateSuggestionsPrResult = {
	batchId: string;
	status: "completed" | "failed";
	prNumber: number | null;
	prUrl: string | null;
	includedSuggestionIds: string[];
	excluded: CreateSuggestionsPrExcludedItem[];
};

export type SuggestionCreatePrCandidate = Pick<
	SuggestionDetail,
	"id" | "docPath" | "baseDocSha" | "proposedContent" | "reasoning"
>;

export type ProjectSuggestionTarget = {
	projectId: string;
	repositoryId: string;
	repositoryFullName: string;
	baseBranch: string;
	provider: "github" | "gitlab" | "bitbucket";
	providerInstallationId: string;
};
