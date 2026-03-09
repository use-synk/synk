import { getRunDetail } from "@/api/endpoints";
import { fetchQuery } from "@/api/server";
import { RunContent } from "@/modules/runs/components/run-content";
import { notFound } from "next/navigation";

async function ServerPage(props: PageProps<"/[slug]/project/[project]/runs/[run]">) {
	const { run: runId } = await props.params;

	const run = await fetchQuery(getRunDetail({ runId }));

	if (!run) {
		notFound();
	}

	return <RunContent run={run.data} />;
}

export default ServerPage;
