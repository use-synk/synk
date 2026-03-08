import { SuggestionsList } from "./suggestions-list";

function SuggestionsContent({
	projectId,
	...props
}: React.ComponentProps<"main"> & { projectId: string }) {
	return (
		<main {...props}>
			<SuggestionsList projectId={projectId} />
		</main>
	);
}

export { SuggestionsContent };
