import { SuggestionDetailContent } from "@/components/suggestions/suggestion-detail-content";

export default async function SuggestionDetailSheetPage(props: {
	params: Promise<{ id: string; suggestionId: string }>;
}) {
	const { id, suggestionId } = await props.params;

	return <SuggestionDetailContent projectId={id} suggestionId={suggestionId} />;
}
