import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { NormalizedRunStep } from "@/modules/runs/lib/normalize-run-steps";
import { CircleCheckIcon, CircleXIcon, Loader2Icon } from "lucide-react";

function RunSteps({ steps }: { steps: readonly NormalizedRunStep[] }) {
	return (
		<ul className="space-y-2">
			{steps.map((step) => (
				<li key={step.key} className="rounded-lg border border-stone-200 bg-white">
					<RunStepItem step={step} />
				</li>
			))}
		</ul>
	);
}

function RunStepItem({ step }: { step: NormalizedRunStep }) {
	const Icon =
		step.status === "completed"
			? CircleCheckIcon
			: step.status === "running"
				? Loader2Icon
				: CircleXIcon;

	return (
		<Collapsible defaultOpen={step.status === "failed" || step.status === "running"}>
			<CollapsibleTrigger className="w-full px-4 py-3 cursor-pointer text-left">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<Icon
							className={cn(
								"size-4",
								step.status === "completed" && "text-lime-600",
								step.status === "running" && "text-blue-500 animate-spin",
								step.status === "failed" && "text-red-500",
								step.status === "skipped" && "text-stone-400",
							)}
						/>
						<span className="text-sm font-medium text-stone-900">{step.title}</span>
					</div>
					<span className="text-xs text-stone-500 capitalize">{step.status}</span>
				</div>
			</CollapsibleTrigger>
			<CollapsibleContent className="px-4 pb-4">
				<RunStepContent step={step} />
			</CollapsibleContent>
		</Collapsible>
	);
}

function RunStepContent({ step }: { step: NormalizedRunStep }) {
	if (step.status === "failed") {
		return (
			<div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
				<p className="font-medium">Step failed</p>
				<p className="mt-1">{step.errorMessage ?? "Unknown step failure."}</p>
				{step.errorCode !== null ? <p className="mt-1 text-xs">Code: {step.errorCode}</p> : null}
			</div>
		);
	}

	if (step.status === "running") {
		return <p className="text-sm text-stone-600">Step is still running.</p>;
	}

	if (step.status === "skipped") {
		return <p className="text-sm text-stone-600">Skipped (not executed).</p>;
	}

	if (step.resultValidationError !== null) {
		return (
			<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
				<p className="font-medium">Unexpected step result payload</p>
				<pre className="mt-2 whitespace-pre-wrap break-words text-xs">
					{step.resultValidationError}
				</pre>
			</div>
		);
	}

	return (
		<pre className="overflow-x-auto rounded-md bg-stone-100 px-3 py-2 text-xs text-stone-700">
			{JSON.stringify(step.result, null, 2)}
		</pre>
	);
}

export { RunSteps };
