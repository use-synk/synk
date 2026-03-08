import { getProjectSuggestion } from "@/api/endpoints";
import { fetchQuery } from "@/api/server";
import { SuggestionContent } from "@/modules/suggestion";
import { notFound } from "next/navigation";

export default async function SuggestionDetailPage(props: {
	params: Promise<{ id: string; suggestionId: string }>;
}) {
	const { id, suggestionId } = await props.params;

	const suggestion = await fetchQuery(getProjectSuggestion({ projectId: id, suggestionId }));

	if (!suggestion) {
		notFound();
	}

	return <SuggestionContent suggestion={suggestion.data} />;
}
