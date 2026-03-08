import { SuggestionsContent } from "@/modules/suggestions";

export default async function ServerPage(
	props: PageProps<"/[slug]/project/[project]/suggestions">,
) {
	const { project } = await props.params;

	return <SuggestionsContent projectId={project} />;
}
