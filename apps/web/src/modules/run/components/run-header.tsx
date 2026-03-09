import type { runDetailSchema } from "@/api/endpoints";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getBranchNameFromGitReference } from "@/modules/run/lib/get-branch-name-from-git-reference";
import type { runStatusSchema } from "@synk-ai/shared";
import { format } from "date-fns";
import {
	BoltIcon,
	CircleIcon,
	ClockIcon,
	GitCommitHorizontalIcon,
	RefreshCcwIcon,
	RotateCcwIcon,
	SquareArrowOutUpRightIcon,
} from "lucide-react";
import type z from "zod";

function RunHeader({
	run,
	className,
	...props
}: React.ComponentProps<"header"> & { run: z.infer<typeof runDetailSchema> }) {
	return (
		<header className={cn(className)} {...props}>
			<div className="flex justify-between items-start gap-6 flex-wrap ">
				<div className="flex justify-start items-center gap-4 ">
					<h1 className="text-xl font-medium text-stone-800 max-w-2xl">{formatHeaderTitle(run)}</h1>
					<RunStatusBadge status={run.status} />
				</div>
				<div className="flex justify-center items-center gap-4">
					<button
						type="button"
						className="text-sm font-medium px-2.5 py-1.5 h-7 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
					>
						<RotateCcwIcon className="size-3.5 text-stone-500" />
						Retry
					</button>
					<button
						type="button"
						className="text-sm font-medium px-2.5 py-1.5 h-7 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
					>
						<SquareArrowOutUpRightIcon className="size-3.5 text-stone-500" />
						View Suggestions
					</button>
				</div>
			</div>
			<div className="flex justify-start flex-wrap gap-6 mt-5">
				<div className="flex justify-center items-center gap-1.5">
					<BoltIcon className="size-3.5 text-stone-400 shrink-0" />
					<span className="text-xs font-mono text-stone-600 px-1.5 py-0.5 rounded-sm bg-stone-100">
						{run.triggerRef}
					</span>
				</div>
				<div className="flex justify-center items-center gap-1.5">
					<GitCommitHorizontalIcon className="size-3.5 text-stone-400 shrink-0" />
					<span className="text-xs font-mono text-stone-600 px-1.5 py-0.5 rounded-sm bg-stone-100">
						{run.triggerCommitSha?.slice(0, 8)}
					</span>
				</div>
				<div className="flex justify-center items-center gap-1.5">
					<ClockIcon className="size-3.5 shrink-0 text-stone-400" />
					<span className="text-sm text-stone-600">
						Started {format(new Date(run.startedAt ?? ""), "PPP")}
					</span>
				</div>
				<div className="flex justify-center items-center gap-1.5">
					<RefreshCcwIcon className="size-3.5 shrink-0 text-stone-400" />
					<span className="text-sm text-stone-600">Attempt {run.attemptCount}</span>
				</div>
			</div>
		</header>
	);
}

function formatHeaderTitle(run: z.infer<typeof runDetailSchema>) {
	if (run.triggerType === "manual") {
		return (
			<span>
				Manual run on{" "}
				<span className="text-stone-700 font-mono px-1.5 py-0.5 rounded-sm bg-stone-100 text-lg ms-1">
					{getBranchNameFromGitReference(run.triggerRef)}
				</span>
			</span>
		);
	}
	if (run.triggerType === "push") {
		return (
			<span>
				Push to{" "}
				<span className="text-stone-700 font-mono px-1.5 py-0.5 rounded-sm bg-stone-100 text-lg ms-1">
					{getBranchNameFromGitReference(run.triggerRef)}
				</span>
			</span>
		);
	}
	if (run.triggerType === "merge") {
		return `Merge request #${run.triggerMergeRequestNumber}`;
	}
	return "Run";
}

function RunStatusBadge({ status }: { status: z.infer<typeof runStatusSchema> }) {
	let label: string;

	switch (status) {
		case "completed":
			label = "Completed";
			break;
		case "canceled":
			label = "Canceled";
			break;
		case "failed":
			label = "Failed";
			break;
		case "skipped":
			label = "Skipped";
			break;
		case "running":
			label = "Running";
			break;
		case "queued":
			label = "Queued";
			break;
		default:
			label = "Unknown";
			break;
	}

	return (
		<Badge
			variant={"outline"}
			className={cn(
				status === "completed" &&
					"bg-green-50 text-green-700 border-green-300 [&>svg]:fill-green-400",
				status === "failed" && "bg-red-50 text-red-700 border-red-300 [&>svg]:fill-red-400",
				status === "canceled" && "bg-gray-50 text-gray-700 border-gray-300 [&>svg]:fill-gray-400",
				status === "skipped" &&
					"bg-yellow-50 text-yellow-700 border-yellow-300 [&>svg]:fill-yellow-400",
				status === "running" && "bg-blue-50 text-blue-700 border-blue-300 [&>svg]:fill-blue-400",
				status === "queued" &&
					"bg-orange-50 text-orange-700 border-orange-300 [&>svg]:fill-orange-400",
			)}
		>
			<CircleIcon className="text-background shrink-0 size-2! " />
			<span>{label}</span>
		</Badge>
	);
}

export { RunHeader };
