"use client";

import { useApiQuery } from "@/api/client";
import { listProjectSuggestions } from "@/api/endpoints";
import { format } from "date-fns";
import type React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../ui/sheet";

export function ReviewDecisions({
	projectId,
	...props
}: React.ComponentProps<typeof SheetTrigger> & {
	projectId: string;
}) {
	return (
		<Sheet>
			<SheetTrigger {...props} />
			<SheetContent className={"data-[side=right]:sm:max-w-2xl"}>
				<SheetHeader>
					<SheetTitle>Review decisions</SheetTitle>
					<SheetDescription>
						The following suggestions have been accepted and will be applied to the next PR.
					</SheetDescription>
				</SheetHeader>
				<div className="p-4">
					<ReviewDecisionsContent projectId={projectId} />
				</div>
				<SheetFooter>
					<Button>Commit</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export function ReviewDecisionsContent({ projectId }: { projectId: string }) {
	const {
		data: suggestions,
		isLoading,
		error,
	} = useApiQuery(
		listProjectSuggestions({
			projectId,
			page: 1,
			pageSize: 100,
			status: ["accepted"],
		}),
		{
			refetchOnMount: true,
			staleTime: 0,
		},
	);

	if (isLoading) {
		return <div>Loading...</div>;
	}

	if (error) {
		return <div>Error: {error.message}</div>;
	}

	return (
		<div>
			<p className="font-medium text-stone-800 mb-4">Accepted suggestions</p>
			<div className="space-y-4">
				{suggestions?.data.map((suggestion) => (
					<div key={suggestion.id} className="rounded-md px-5 py-3 border border-stone-200">
						<p className="font-medium text-sm text-stone-800">
							<span className="text-stone-500">#{suggestion.readableId}: </span>
							{suggestion.title}
						</p>
						<p className="text-xs text-stone-500 mt-1 flex items-center gap-1 flex-wrap">
							<span>Accepted by</span>
							<Avatar className={"size-3 shrink-0 ms-1"}>
								<AvatarImage src={suggestion.decidedByUser?.image ?? ""} />
								<AvatarFallback>{suggestion.decidedByUser?.name?.charAt(0) ?? "?"}</AvatarFallback>
							</Avatar>
							<span>
								{suggestion.decidedByUser?.name} on{" "}
								{format(new Date(suggestion.decidedAt ?? ""), "MMM d, yyyy")} at{" "}
								{format(new Date(suggestion.decidedAt ?? ""), "h:mm a")}
							</span>
						</p>
					</div>
				))}
			</div>
			<div className="mt-6 text-xs text-stone-500">
				{suggestions?.data.length} accepted suggestions
			</div>
		</div>
	);
}
