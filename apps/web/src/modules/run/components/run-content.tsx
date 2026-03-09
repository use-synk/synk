import type { runDetailSchema } from "@/api/endpoints";
import { Header } from "@/components/header";
import { cn } from "@/lib/utils";
import { normalizeRunSteps } from "@/modules/run/lib/normalize-run-steps";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import type z from "zod";
import { RunHeader } from "./run-header";
import { RunStats } from "./run-stats";
import { RunSteps } from "./run-steps";
import { RunTokenUsage } from "./run-token-usage";
import { RunTriageResult } from "./run-triage-result";

function RunContent({
	run,
	className,
	...props
}: React.ComponentProps<"main"> & { run: z.infer<typeof runDetailSchema> }) {
	const steps = normalizeRunSteps(run);

	return (
		<Fragment>
			<Header />
			<main className={cn("py-page-vertical", className)} {...props}>
				<section>
					<div className="max-w-7xl w-full px-8 mx-auto">
						<div className="mb-10">
							<Link
								className="text-sm font-medium text-stone-700 flex justify-center items-center w-fit gap-1.5"
								href={"#"}
							>
								<ArrowLeftIcon className="size-3.5 text-stone-500" />
								<span>Back to runs</span>
							</Link>
						</div>
						<RunHeader run={run} />
						<RunStats run={run} className="mt-10" />
					</div>
				</section>
				<section className="mt-20">
					<div className="max-w-7xl w-full px-8 mx-auto">
						<div className="mb-4">
							<p className="text-sm font-medium text-stone-800">Steps</p>
						</div>
						<RunSteps steps={steps} />
					</div>
					<div className="max-w-7xl w-full px-8 mx-auto mt-20">
						<div className="mb-4">
							<p className="text-sm font-medium text-stone-800">Triage result</p>
						</div>
						<RunTriageResult run={run} />
					</div>
					<div className="max-w-7xl w-full px-8 mx-auto mt-20">
						<div className="mb-4">
							<p className="text-sm font-medium text-stone-800">Token usage</p>
						</div>
						<RunTokenUsage run={run} />
					</div>
				</section>
			</main>
		</Fragment>
	);
}

export { RunContent };
