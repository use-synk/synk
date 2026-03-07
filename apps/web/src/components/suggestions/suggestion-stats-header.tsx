"use client";

import { useApiQuery } from "@/api/client";
import { getProjectSuggestionStats } from "@/api/endpoints";
import { GitPullRequestIcon } from "lucide-react";
import { ReviewDecisions } from "./review-decisions";

export function SuggestionStatsHeader({ projectId }: { projectId: string }) {
	const { data, isLoading } = useApiQuery(getProjectSuggestionStats({ projectId }));

	if (isLoading || data === undefined) {
		return <p className="text-xs text-stone-500">Loading suggestion stats...</p>;
	}

	return (
		<p className="text-sm text-stone-600 flex justify-center items-center gap-6">
			<span>
				<span className="font-medium text-stone-800">{data.data.accepted}</span> /{" "}
				<span className="font-medium text-stone-800">{data.data.pending}</span> accepted
			</span>
			<ReviewDecisions
				render={
					<button
						className="h-7 px-2.5 py-1 rounded-sm bg-linear-to-b from-orange-400 to-orange-500 border border-orange-500/10 text-white inset-shadow-2xs inset-shadow-orange-300 flex justify-center items-center gap-2 hover:from-orange-500 transition-all duration-500 cursor-pointer"
						type="button"
					>
						<GitPullRequestIcon className="size-4 text-orange-200" />
						Create PR
					</button>
				}
				projectId={projectId}
			/>
		</p>
	);
}
