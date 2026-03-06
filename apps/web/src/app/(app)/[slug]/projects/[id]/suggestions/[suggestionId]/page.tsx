import { SuggestionDetailContent } from "@/components/suggestions/suggestion-detail-content";

export default async function SuggestionDetailPage(props: {
	params: Promise<{ id: string; suggestionId: string }>;
}) {
	const { id, suggestionId } = await props.params;

	return (
		<main className="py-12">
			<section>
				<div className="max-w-7xl w-full mx-auto px-8">
					<p className="text-lg font-medium text-stone-800">Suggestion</p>
					<div className="mt-6 border border-stone-200 rounded-md overflow-hidden h-[calc(100vh-16rem)]">
						<SuggestionDetailContent projectId={id} suggestionId={suggestionId} />
					</div>
				</div>
			</section>
		</main>
	);
}
