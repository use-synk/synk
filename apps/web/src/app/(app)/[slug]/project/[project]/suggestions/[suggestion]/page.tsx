import { getProjectSuggestion } from "@/api/endpoints";
import { fetchQuery } from "@/api/server";
import { SuggestionContent } from "@/modules/suggestion";
import { notFound } from "next/navigation";

async function ServerPage(props: PageProps<"/[slug]/project/[project]/suggestions/[suggestion]">) {
	const { project, suggestion: suggestionId, slug } = await props.params;

	const suggestion = await fetchQuery(getProjectSuggestion({ projectId: project, suggestionId }));

	if (!suggestion) {
		notFound();
	}

	return <SuggestionContent suggestion={suggestion.data} projectId={project} orgSlug={slug} />;
}

export default ServerPage;
