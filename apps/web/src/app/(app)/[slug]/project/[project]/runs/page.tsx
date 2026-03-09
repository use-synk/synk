import { listProjectRuns } from "@/api/endpoints";
import { fetchQuery } from "@/api/server";

export default async function ServerPage(props: PageProps<"/[slug]/project/[project]/runs">) {
	const { project } = await props.params;

	const [runs] = await Promise.all([
		fetchQuery(listProjectRuns({ projectId: project, page: 1, pageSize: 10 })),
	]);

	return <pre>{JSON.stringify(runs, null, 2)}</pre>;
}
