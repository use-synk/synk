import type { runDetailSchema } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import { deriveRunStats } from "@/modules/runs/lib/derive-run-stats";
import type z from "zod";

function RunStats({
	run,
	className,
	...props
}: React.ComponentProps<"div"> & { run: z.infer<typeof runDetailSchema> }) {
	const stats = deriveRunStats(run);
	const confidencePercent =
		stats.confidence === null
			? null
			: stats.confidence <= 1
				? Math.round(stats.confidence * 100)
				: Math.round(stats.confidence);

	return (
		<div
			className={cn(
				"rounded-lg border border-stone-200 grid grid-cols-4 divide-x divide-stone-200 bg-linear-to-br from-background via-background to-lime-50",
				className,
			)}
			{...props}
		>
			<RunStatItem>
				<RunStatTitel>Duration</RunStatTitel>
				<RunStatValue>{formatDurationMs(stats.durationMs)}</RunStatValue>
				<RunStatDescription>{stats.stepCount} steps</RunStatDescription>
			</RunStatItem>
			<RunStatItem>
				<RunStatTitel>Token usage</RunStatTitel>
				<RunStatValue>{formatCount(stats.tokenUsage.total)}</RunStatValue>
				<RunStatDescription>
					{formatCount(stats.tokenUsage.prompt)} prompt · {formatCount(stats.tokenUsage.completion)}{" "}
					completion
				</RunStatDescription>
			</RunStatItem>
			<RunStatItem>
				<RunStatTitel>Docs affected</RunStatTitel>
				<RunStatValue>
					{stats.docsAffectedCount === null ? "n/a" : formatCount(stats.docsAffectedCount)}
				</RunStatValue>
				<RunStatDescription>
					{stats.firstAffectedDocPath ??
						(stats.docsAffectedCount === 0 ? "No docs affected" : "Path unavailable")}
				</RunStatDescription>
			</RunStatItem>
			<RunStatItem>
				<RunStatTitel>Confidence</RunStatTitel>
				<RunStatValue>{confidencePercent === null ? "n/a" : `${confidencePercent}%`}</RunStatValue>
				<RunStatDescription>
					{stats.suggestionCount === null
						? "Suggestion count unavailable"
						: stats.suggestionCount === 1
							? "1 suggestion created"
							: `${formatCount(stats.suggestionCount)} suggestions created`}
				</RunStatDescription>
			</RunStatItem>
		</div>
	);
}

function formatDurationMs(durationMs: number | null): string {
	if (durationMs === null) {
		return "n/a";
	}
	if (durationMs < 1000) {
		return `${durationMs}ms`;
	}
	return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatCount(value: number): string {
	return value.toLocaleString();
}

function RunStatItem({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("p-4", className)} {...props} />;
}

function RunStatTitel({ className, ...props }: React.ComponentProps<"span">) {
	return <span className={cn("text-xs font-medium text-stone-500 block", className)} {...props} />;
}

function RunStatValue({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span className={cn("text-xl font-medium text-stone-800 block mt-2", className)} {...props} />
	);
}

function RunStatDescription({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("text-xs text-stone-500 mt-1", className)} {...props} />;
}

export { RunStats };
