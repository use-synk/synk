import type { projectDetailSchema, runSummarySchema } from "@/api/endpoints";
import { SuggestionStatsHeader } from "@/components/suggestions/suggestion-stats-header";
import { SuggestionsList } from "@/components/suggestions/suggestions-list";
import { cn } from "@/lib/utils";
import type { runStatusSchema } from "@synk-ai/shared";
import { format } from "date-fns";
import {
	CheckIcon,
	CircleXIcon,
	ClockIcon,
	GitBranchIcon,
	GitCommitIcon,
	Loader2Icon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import Link from "next/link";
import type React from "react";
import { useMemo } from "react";
import type z from "zod";
import { type PageTabItem, PageTabList, PageTabPanel, PageTabs } from "../page-tabs";
import { PageDescription, PageTitle } from "../typography";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { GithubLight } from "../ui/svgs/githubLight";

export const projectTabItems: PageTabItem[] = [
	{
		label: "Overview",
		value: "overview",
	},
	{
		label: "Suggestions",
		value: "suggestions",
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
				<SuggestionsTab projectId={projectDetail.id} />
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

/* ----- Suggestions -------------------------------------------------------------- */

function SuggestionsTab({ projectId }: { projectId: string }) {
	return (
		<PageTabPanel value={"suggestions"}>
			<section className="pb-12">
				<div className="mx-auto px-8 w-full max-w-7xl">
					<p className="text-lg font-medium text-stone-800">Suggestions</p>
					<div className="mt-1">
						<SuggestionStatsHeader projectId={projectId} />
					</div>
				</div>
			</section>
			<section>
				<div className="max-w-7xl w-full mx-auto px-8">
					<SuggestionsList projectId={projectId} />
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
			<section className="mt-12">
				<div className="w-full max-w-7xl mx-auto px-8">
					<ul className="rounded-lg border border-stone-200 divide-y divide-stone-200">
						{runs.map((run) => (
							<RunRow key={run.id} run={run} />
						))}
					</ul>
				</div>
			</section>
		</PageTabPanel>
	);
}

function RunStatusIcon({
	status,
	className,
	...props
}: React.ComponentProps<"svg"> & { status: z.infer<typeof runStatusSchema> }) {
	switch (status) {
		case "queued":
			return <ClockIcon className={cn("text-orange-500", className)} {...props} />;
		case "running":
			return <Loader2Icon className={cn("text-blue-500 animate-spin", className)} {...props} />;
		case "completed":
			return <CheckIcon className={cn("text-green-500", className)} {...props} />;
		case "skipped":
			return <CircleXIcon className={cn("text-gray-500", className)} {...props} />;
		case "failed":
			return <TriangleAlertIcon className={cn("text-red-500", className)} {...props} />;
		case "canceled":
			return <TriangleAlertIcon className={cn("text-gray-500", className)} {...props} />;
		default:
			return <XIcon className={cn("text-gray-500", className)} {...props} />;
	}
}

function RunRow({ run }: { run: z.infer<typeof runSummarySchema> }) {
	const title = useMemo(() => {
		if (run.triggerType === "manual") {
			return `Manual run on ${run.triggerRef}`;
		}
		if (run.triggerType === "push") {
			return `Push to ${run.triggerRef}`;
		}
		if (run.triggerType === "merge" && run.prMessage) {
			return (
				<>
					{run.prMessage}{" "}
					<span className="text-stone-500">
						(
						<Link href={run.docPrUrl ?? ""} className="text-blue-500">
							#{run.prNumber}
						</Link>
						)
					</span>
				</>
			);
		}
		return "Unknown trigger type";
	}, [run]);

	return (
		<li className="px-6 py-4">
			<div className=" flex justify-start items-start gap-4">
				<div className="flex justify-start items-center mt-1.25">
					<RunStatusIcon status={run.status} className="size-4" />
				</div>
				<div>
					<p className="font-medium">{title}</p>
					<div className="mt-1 flex justify-start items-center gap-4">
						{(run.prAuthorName || run.prAuthorUsername) && (
							<div className="flex justify-start items-center gap-2 relative">
								<Avatar className={"shrink-0 size-4"}>
									<AvatarImage src={run.prAuthorAvatarUrl ?? ""} />
									<AvatarFallback>
										{run.prAuthorName?.charAt(0) ?? run.prAuthorUsername?.charAt(0) ?? "?"}
									</AvatarFallback>
								</Avatar>
								<Link
									href={`https://github.com/${run.prAuthorUsername}`}
									className="text-sm text-stone-500 transition-colors hover:underline underline-offset-4"
									target="_blank"
									rel="noopener noreferrer"
								>
									<span className="absolute inset-0 w-full h-full" />
									{run.prAuthorName ?? run.prAuthorUsername}
								</Link>
							</div>
						)}

						{/* {run.targetBranch && run.sourceBranch && (
							<div className="flex justify-center items-center gap-1 text-sm text-stone-500">
								<span>{run.sourceBranch}</span>
								<ArrowRightIcon className="size-3.5 text-stone-400" />
								<span>{run.targetBranch}</span>
							</div>
						)} */}
						{run.triggerRef && (
							<div className="flex justify-center items-center text-sm text-stone-500 gap-1.5">
								<GitBranchIcon className="size-3.5 text-stone-400" />
								{run.triggerRef}
							</div>
						)}
						{run.triggerCommitSha && (
							<div className="flex justify-center items-center text-sm text-stone-500 gap-1.5">
								<GitCommitIcon className="size-3.5 text-stone-400" />
								{run.triggerCommitSha.slice(0, 8)}
							</div>
						)}
					</div>
				</div>
			</div>
		</li>
	);
}
