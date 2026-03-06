import { Skeleton } from "@/components/ui/skeleton";

export function SuggestionDetailSkeleton() {
	return (
		<div className="h-full min-h-0 flex flex-col">
			<div className="px-6 py-4 border-b border-stone-200 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<Skeleton className="h-5 w-72" />
					<Skeleton className="h-5 w-20" />
				</div>
				<div className="flex items-center gap-2">
					<Skeleton className="h-5 w-48" />
					<Skeleton className="h-4 w-10" />
					<Skeleton className="h-4 w-10" />
				</div>
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-4/5" />
			</div>
			<div className="min-h-0 overflow-auto px-6 py-4 space-y-3">
				{Array.from({ length: 12 }).map((_, index) => (
					<Skeleton
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
						key={index}
						className="h-4 w-full"
					/>
				))}
			</div>
		</div>
	);
}
