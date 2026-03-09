import type { runDetailSchema } from "@/api/endpoints";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type React from "react";
import type z from "zod";

type TokenUsage = {
	prompt: number;
	completion: number;
	total: number;
};

type TokenUsageByStage = {
	total: TokenUsage;
	triage: TokenUsage;
	generation: TokenUsage;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readNonNegativeNumber(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return null;
	}
	return value;
}

function normalizeTokenUsage(value: unknown): TokenUsage {
	if (!isRecord(value)) {
		return { prompt: 0, completion: 0, total: 0 };
	}

	const prompt = readNonNegativeNumber(value.prompt) ?? 0;
	const completion = readNonNegativeNumber(value.completion) ?? 0;
	const total = readNonNegativeNumber(value.total) ?? prompt + completion;

	return { prompt, completion, total };
}

function deriveTokenUsageByStage(run: z.infer<typeof runDetailSchema>): TokenUsageByStage {
	const fallback = {
		total: { prompt: 0, completion: 0, total: 0 },
		triage: { prompt: 0, completion: 0, total: 0 },
		generation: { prompt: 0, completion: 0, total: 0 },
	} satisfies TokenUsageByStage;

	if (!isRecord(run.tokenUsage)) {
		return fallback;
	}

	const rootUsage = normalizeTokenUsage(run.tokenUsage);
	const totalUsage = isRecord(run.tokenUsage.total)
		? normalizeTokenUsage(run.tokenUsage.total)
		: rootUsage;

	return {
		total: totalUsage,
		triage: normalizeTokenUsage(run.tokenUsage.triage),
		generation: normalizeTokenUsage(run.tokenUsage.generation),
	};
}

function formatTokenCount(value: number): string {
	return value.toLocaleString();
}

function RunTokenUsage({
	run,
	className,
	...props
}: React.ComponentProps<"div"> & { run: z.infer<typeof runDetailSchema> }) {
	const tokenUsage = deriveTokenUsageByStage(run);

	return (
		<div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)} {...props}>
			<TokenUsageCard title="Total usage" usage={tokenUsage.total} />
			<TokenUsageCard title="Triage usage" usage={tokenUsage.triage} />
			<TokenUsageCard title="Generation usage" usage={tokenUsage.generation} />
		</div>
	);
}

function TokenUsageCard({
	title,
	usage,
	className,
	...props
}: React.ComponentProps<"div"> & { title: string; usage: TokenUsage }) {
	return (
		<div className={cn("border border-stone-200 rounded-md bg-stone-100", className)} {...props}>
			<div className="px-4 pb-0.5 pt-0">
				<span className="text-xs font-medium text-stone-700">{title}</span>
			</div>
			<div className="px-4 py-4 ring-1 ring-stone-200 bg-background rounded-md space-y-2">
				<TokenUsageRow label="Prompt" value={usage.prompt} />
				<TokenUsageRow label="Completion" value={usage.completion} />
				<Separator />
				<TokenUsageRow label="Total" value={usage.total} />
			</div>
		</div>
	);
}

function TokenUsageRow({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="text-sm text-stone-500">{label}</span>
			<span className="text-sm font-medium text-stone-800">{formatTokenCount(value)}</span>
		</div>
	);
}

export { RunTokenUsage };
