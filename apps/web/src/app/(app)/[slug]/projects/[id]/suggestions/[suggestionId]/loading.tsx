import { SuggestionDetailSkeleton } from "@/components/suggestions/suggestion-detail-skeleton";

export default function SuggestionDetailPageLoading() {
	return (
		<main className="py-12">
			<section>
				<div className="max-w-7xl w-full mx-auto px-8">
					<p className="text-lg font-medium text-stone-800">Suggestion</p>
					<div className="mt-6 border border-stone-200 rounded-md overflow-hidden h-[calc(100vh-16rem)]">
						<SuggestionDetailSkeleton />
					</div>
				</div>
			</section>
		</main>
	);
}
