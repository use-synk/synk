import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { NormalizedRunStep } from "@/modules/run/lib/normalize-run-steps";
import { type VariantProps, cva } from "class-variance-authority";
import { format } from "date-fns";
import {
	ArrowRightIcon,
	CheckIcon,
	ClockArrowUpIcon,
	ClockCheckIcon,
	Loader2Icon,
	MinusIcon,
	XIcon,
} from "lucide-react";
import type React from "react";

function formatDurationMs(durationMs: number | null): string {
	if (durationMs === null) {
		return "n/a";
	}
	if (durationMs < 1000) {
		return `${durationMs}ms`;
	}
	return `${(durationMs / 1000).toFixed(2)}s`;
}

function RunSteps({ steps }: { steps: readonly NormalizedRunStep[] }) {
	return (
		<ul className="rounded-lg border border-stone-200 divide-y divide-stone-200">
			{steps.map((step) => (
				<li key={step.key}>
					<RunStepItem step={step} />
				</li>
			))}
		</ul>
	);
}

function RunStepItem({ step }: { step: NormalizedRunStep }) {
	return (
		<Collapsible defaultOpen={step.status === "failed" || step.status === "running"}>
			<CollapsibleTrigger className="w-full px-4 py-3 cursor-pointer text-left">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-4">
						<RunStepIcon status={step.status} />
						<span className="text-sm font-medium text-stone-900">{step.title}</span>
					</div>
					<span className="text-xs text-stone-500">{formatDurationMs(step.durationMs)}</span>
				</div>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<RunStepContent step={step} />
			</CollapsibleContent>
		</Collapsible>
	);
}

/* ------ Run Step Icon --------------------------------------------------------------------------- */

const runStepIconVariants = cva("flex justify-center items-center rounded-full size-4", {
	variants: {
		status: {
			completed: "bg-green-100 text-green-500",
			running: "bg-blue-100 text-blue-500 [&_svg]:animate-spin",
			failed: "bg-red-100 text-red-500",
			skipped: "bg-stone-100 text-stone-500",
		},
	},
});

function RunStepIcon({
	status,
	className,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof runStepIconVariants>) {
	let Icon = MinusIcon;

	switch (status) {
		case "completed":
			Icon = CheckIcon;
			break;
		case "running":
			Icon = Loader2Icon;
			break;
		case "skipped":
			Icon = ArrowRightIcon;
			break;
		case "failed":
			Icon = XIcon;
			break;
	}

	return (
		<div className={cn(runStepIconVariants({ status }), className)} {...props}>
			<Icon className="size-2.5" />
		</div>
	);
}

function RunStepContent({
	step,
	className,
	...props
}: React.ComponentProps<"div"> & { step: NormalizedRunStep }) {
	// if (step.status === "failed") {
	// 	return (
	// 		<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
	// 			<p className="font-medium">Step failed</p>
	// 			<p className="mt-1">{step.errorMessage ?? "Unknown step failure."}</p>
	// 			{step.errorCode !== null ? <p className="mt-1 text-xs">Code: {step.errorCode}</p> : null}
	// 		</div>
	// 	);
	// }

	// if (step.status === "running") {
	// 	return <p className="text-sm text-stone-600">Step is still running.</p>;
	// }

	// if (step.status === "skipped") {
	// 	return <p className="text-sm text-stone-600">Skipped (not executed).</p>;
	// }

	// if (step.resultValidationError !== null) {
	// 	return (
	// 		<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
	// 			<p className="font-medium">Unexpected step result payload</p>
	// 			<pre className="mt-2 whitespace-pre-wrap break-words text-xs">
	// 				{step.resultValidationError}
	// 			</pre>
	// 		</div>
	// 	);
	// }

	// return (
	// 	<pre className="overflow-x-auto rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-700">
	// 		{JSON.stringify(step.result, null, 2)}
	// 	</pre>
	// );
	return (
		<div
			className={cn("py-3 px-4 pl-12 border-t border-stone-200 bg-stone-100", className)}
			{...props}
		>
			<div className="flex justify-start items-center gap-6 flex-wrap">
				<p className="text-xs text-stone-600 flex justify-center items-center gap-1.5">
					<ClockArrowUpIcon className="size-3.5 text-stone-400" />{" "}
					{step.startedAt ? format(new Date(step.startedAt), "PPPp") : "Not started"}
				</p>
				<p className="text-xs text-stone-600 flex justify-center items-center gap-1.5">
					<ClockCheckIcon className="size-3.5 text-stone-400" />{" "}
					{step.completedAt ? format(new Date(step.completedAt), "PPPp") : "Not completed"}
				</p>
			</div>
			<pre className="overflow-x-auto rounded-sm bg-background px-3 py-2 text-xs text-stone-700 border border-border mt-3">
				{step.status === "running" && "This step is still running."}
				{step.status === "skipped" && "This step was skipped."}
				{step.status === "failed" && <p>Failed</p>}
				{step.status === "completed" && JSON.stringify(step.result, null, 2)}
			</pre>
			{step.status === "failed" && (
				<div className="mt-3">
					<p className="text-sm text-stone-600">
						<span className="font-medium text-red-500">Error:</span>{" "}
						{step.errorMessage ?? "Unknown step failure."} (#{step.errorCode ?? "unknown"})
					</p>
				</div>
			)}
		</div>
	);
}

export { RunSteps };
