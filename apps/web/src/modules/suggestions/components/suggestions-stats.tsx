"use client";

import { useApiQuery } from "@/api/client";
import { getProjectSuggestionStats } from "@/api/endpoints";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Fragment } from "react";

function SuggestionsStats({
	projectId,
	className,
	...props
}: React.ComponentProps<"div"> & { projectId: string }) {
	const { isLoading, data } = useApiQuery(getProjectSuggestionStats({ projectId }));

	return (
		<div
			className={cn(
				"flex justify-center items-center text-sm font-medium text-stone-800 gap-2",
				className,
			)}
			{...props}
		>
			{isLoading || !data ? (
				<Skeleton className="h-6 w-20" />
			) : (
				<Fragment>
					<span>
						{data.data.accepted} <span className="text-stone-500">accepted</span>
					</span>
					<span className="text-stone-300">/</span>
					<span>
						{data.data.pending} <span className="text-stone-500">pending</span>
					</span>
				</Fragment>
			)}
		</div>
	);
}

export { SuggestionsStats };
