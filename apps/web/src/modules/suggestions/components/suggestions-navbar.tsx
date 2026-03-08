import { Header } from "@/components/header";
import { CreateSuggestionsPR } from "@/modules/suggestions/components/suggestions-create-pr";
import { SuggestionsStats } from "@/modules/suggestions/components/suggestions-stats";

function SuggestionsNavbar({
	projectId,
	...props
}: React.ComponentProps<typeof Header> & { projectId: string }) {
	return (
		<Header {...props}>
			<SuggestionsStats projectId={projectId} />
			<CreateSuggestionsPR className="ml-auto" />
		</Header>
	);
}

export { SuggestionsNavbar };
