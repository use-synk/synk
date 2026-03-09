import type { runDetailSchema } from "@/api/endpoints";
import { normalizeRunSteps } from "@/modules/runs/lib/normalize-run-steps";
import type z from "zod";
import { RunSteps } from "./run-steps";

function RunContent({ run }: { run: z.infer<typeof runDetailSchema> }) {
	const steps = normalizeRunSteps(run);

	return (
		<main className="py-12">
			<section>
				<div className="mx-auto w-full max-w-4xl px-8">
					<h1 className="text-xl font-semibold text-stone-900">Job steps</h1>
					<p className="mt-1 text-sm text-stone-600">Detailed execution timeline for this run.</p>
				</div>
			</section>
			<section className="mt-6">
				<div className="mx-auto w-full max-w-4xl px-8">
					<RunSteps steps={steps} />
				</div>
			</section>
		</main>
	);
}

export { RunContent };
