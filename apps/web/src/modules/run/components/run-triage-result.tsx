import type { runDetailSchema } from "@/api/endpoints";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMDXComponents } from "@/mdx-components";
import { BrainIcon } from "lucide-react";
import { compileMDX } from "next-mdx-remote/rsc";
import { Fragment, Suspense } from "react";
import z from "zod";

const triageResultSchema = z.object({
	triage: z.object({
		reasoning: z.string(),
		confidence: z.number(),
		needsUpdate: z.boolean(),
		affectedDocFiles: z.array(z.string()),
		skippedByConfidence: z.boolean().nullable(),
	}),
});

function RunTriageResult({
	run,
	className,
	...props
}: React.ComponentProps<"div"> & { run: z.infer<typeof runDetailSchema> }) {
	const triageResult = triageResultSchema.safeParse(run.result);

	return (
		<div className={cn("border border-stone-200 rounded-md px-4 py-3", className)} {...props}>
			{triageResult.success ? (
				<Fragment>
					<div className="flex justify-between items-center">
						<p className="text-sm font-medium flex items-center gap-2">
							<BrainIcon className="size-3.5 text-stone-500" />
							{triageResult.data.triage.needsUpdate && !triageResult.data.triage.skippedByConfidence
								? "Docs update required"
								: "No action required"}
						</p>
						<Badge variant={"outline"}>
							{formatConfidence(triageResult.data.triage.confidence)}% confidence
						</Badge>
					</div>
					<RunTriageResultBody triage={triageResult.data.triage} className="mt-3" />
				</Fragment>
			) : (
				<div>
					<p className="text-sm font-medium text-red-500">Unable to parse triage result.</p>
					<p className="text-sm text-stone-500 max-w-prose mt-1">
						Either the result is missing or invalid. Please contact support if you believe this is
						an unexpected behavior.
					</p>
				</div>
			)}
		</div>
	);
}

function RunTriageResultBody({
	triage,
	className,
	...props
}: React.ComponentProps<"div"> & { triage: z.infer<typeof triageResultSchema>["triage"] }) {
	const content = async () => {
		if (triage.skippedByConfidence) {
			return <Fragment />;
		}

		const { content } = await compileMDX({
			source: triage.reasoning,
			components: useMDXComponents(),
		});

		return content;
	};

	return (
		<div
			className={cn(
				"border-l-2 border-stone-300 pl-5  text-stone-600 text-sm max-w-2xl leading-6",
				triage.skippedByConfidence && "border-orange-300",
				className,
			)}
			{...props}
		>
			{triage.skippedByConfidence &&
				"No suggestions were generated because the AI confidence was below the threshold."}
			<Suspense fallback={<div>Compling MDX...</div>}>{content()}</Suspense>
		</div>
	);
}

function formatConfidence(confidence: number): string {
	if (Number.isNaN(confidence)) {
		return "n/a";
	}

	const percent = confidence * 100;
	return percent % 1 === 0 ? percent.toString() : percent.toFixed(2).replace(/\.?0+$/, "");
}

export { RunTriageResult };
