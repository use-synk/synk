export const ANALYZE_CHANGES_QUEUE_NAME = "analyze-changes";

export type AnalyzeChangesJobPayload = {
	installationId: string;
	repositoryId: string;
	trigger: {
		type: "push" | "merge";
		ref: string;
		commitSha: string;
		prNumber?: number;
	};
};
