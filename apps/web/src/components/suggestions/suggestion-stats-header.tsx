"use client";

import { useApiQuery } from "@/api/client";
import { getProjectSuggestionStats } from "@/api/endpoints";

export function SuggestionStatsHeader({ projectId }: { projectId: string }) {
	const { data, isLoading } = useApiQuery(getProjectSuggestionStats({ projectId }));

	if (isLoading || data === undefined) {
		return <p className="text-xs text-stone-500">Loading suggestion stats...</p>;
	}

	return (
		<p className="text-sm text-stone-600">
			<span className="font-medium text-stone-800">{data.data.pending}</span> pending
			<span className="mx-2 text-stone-300">|</span>
			<span className="font-medium text-stone-800">{data.data.accepted}</span> accepted
		</p>
	);
}
