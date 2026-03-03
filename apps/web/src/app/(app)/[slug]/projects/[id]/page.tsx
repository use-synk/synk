import { getProjectDetail, listProjectRuns } from "@/api/endpoints";
import { fetchQuery } from "@/api/server";
import { ProjectContent } from "@/components/project/project-content";

export default async function ServerPage(props: PageProps<"/[slug]/projects/[id]">) {
	const { id } = await props.params;

	const [project, runs] = await Promise.all([
		fetchQuery(getProjectDetail({ projectId: id })),
		fetchQuery(listProjectRuns({ projectId: id, page: 1, pageSize: 10 })),
	]);

	return <ProjectContent projectDetail={project.data} runs={runs.data} />;
}
