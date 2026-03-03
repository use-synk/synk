import type { projectDetailSchema, runSummarySchema } from "@/api/endpoints";
import { format } from "date-fns";
import type z from "zod";
import { type PageTabItem, PageTabList, PageTabPanel, PageTabs } from "../page-tabs";
import { PageDescription, PageTitle } from "../typography";
import { GithubLight } from "../ui/svgs/githubLight";

export const projectTabItems: PageTabItem[] = [
	{
		label: "Overview",
		value: "overview",
	},
	{
		label: "Runs",
		value: "runs",
	},
];

export function ProjectContent({
	projectDetail,
	runs,
}: {
	projectDetail: z.infer<typeof projectDetailSchema>;
	runs: z.infer<typeof runSummarySchema>[];
}) {
	return (
		<PageTabs tabs={projectTabItems}>
			<section className="w-full border-b border-stone-200">
				<div className="max-w-7xl w-full px-8 mx-auto">
					<PageTabList tabs={projectTabItems} />
				</div>
			</section>
			<main className="py-12">
				<OverviewTab projectDetail={projectDetail} />
				<RunsTab runs={runs} />
			</main>
		</PageTabs>
	);
}

/* ----- Overview ----------------------------------------------------------------- */

function OverviewTab({
	projectDetail: project,
}: {
	projectDetail: z.infer<typeof projectDetailSchema>;
}) {
	return (
		<PageTabPanel value={"overview"}>
			<section>
				<div className="mx-auto px-8 w-full max-w-7xl">
					<div className="flex justify-start items-start gap-4 flex-wrap">
						<div className="bg-linear-to-b from-background to-stone-100 ring-1 ring-stone-700/10 shadow-sm rounded-md flex justify-center items-center size-8 mt-0.5">
							<GithubLight className="size-5" />
						</div>
						<div>
							<PageTitle>{project.name}</PageTitle>
							<PageDescription className="mt-1">
								Created {format(project.createdAt, "dd.MM.yyyy")} at{" "}
								{format(project.createdAt, "HH:mm")}
							</PageDescription>
						</div>
					</div>
				</div>
			</section>
		</PageTabPanel>
	);
}

/* ----- Runs --------------------------------------------------------------------- */

function RunsTab({ runs }: { runs: z.infer<typeof runSummarySchema>[] }) {
	return (
		<PageTabPanel value={"runs"}>
			<section>
				<div className="mx-auto px-8 w-full max-w-7xl">
					<div className="flex justify-start items-start gap-4 flex-wrap">
						<div>
							<PageTitle>AI Runs</PageTitle>
							<PageDescription className="mt-1 max-w-sm">
								The following runs were recently executed for your documentation site.
							</PageDescription>
						</div>
						<div className="flex justify-center items-center gap-4 ml-auto">
							<button
								type="button"
								className="h-7 rounded-md ring-1 ring-stone-700/10 shadow-xs text-sm font-medium text-center flex justify-center items-center gap-2 px-3 py-1.5 cursor-pointer inset-shadow-2xs inset-shadow-stone-100 text-stone-700 bg-linear-to-b from-background to-stone-50 hover:to-stone-100 transition-all"
							>
								Trigger manual
							</button>
						</div>
					</div>
				</div>
			</section>
			<section className="grid grid-cols-1 gap-4">
				{runs.length === 0 && <p>No runs found</p>}
				{runs.map((run) => (
					<div key={run.id} className="bg-stone-50 rounded-md p-4 w-full">
						<pre>{JSON.stringify(run, null, 2)}</pre>
					</div>
				))}
			</section>
		</PageTabPanel>
	);
}
