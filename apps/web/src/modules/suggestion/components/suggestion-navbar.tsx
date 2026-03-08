import { Header } from "@/components/header";
import { CreateSuggestionsPR } from "@/modules/suggestions/components/suggestions-create-pr";
import { SuggestionsStats } from "@/modules/suggestions/components/suggestions-stats";
import { SuggestionHeaderNav } from "./suggestion-header-nav";

function SuggestionNavbar({
	projectId,
	...props
}: React.ComponentProps<typeof Header> & { projectId: string }) {
	return (
		<Header {...props}>
			<SuggestionsStats projectId={projectId} />
			<SuggestionHeaderNav className="ml-auto" />
			<CreateSuggestionsPR />
		</Header>
	);
}

export { SuggestionNavbar };
