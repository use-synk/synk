"use client";

import { useApiMutation } from "@/api/client";
import {
	decideProjectSuggestion,
	getProjectSuggestionStats,
	type suggestionSummarySchema,
} from "@/api/endpoints";
import { getQueryClient } from "@/api/make-query-client";
import { cn } from "@/lib/utils";
import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { toast } from "sonner";
import type z from "zod";

type SuggestionStatus = z.infer<typeof suggestionSummarySchema>["status"];

const INVALID_TRANSITION_STATUSES: readonly SuggestionStatus[] = ["superseded", "stale", "applied"];

function SuggestionActions({
	projectId,
	suggestionId,
	status,
	className,
	...props
}: React.ComponentProps<"div"> & {
	projectId: string;
	suggestionId: string;
	status: SuggestionStatus;
}) {
	const queryClient = getQueryClient();
	const router = useRouter();
	const disabledByStatus = INVALID_TRANSITION_STATUSES.includes(status);

	const onSuccess = () => {
		queryClient.invalidateQueries({
			queryKey: getProjectSuggestionStats({ projectId }).key,
		});
		router.refresh();
	};

	const onError = (error: Error) => {
		toast.error("Failed to update suggestion", {
			description: error.message,
		});
	};

	const decline = useApiMutation(
		decideProjectSuggestion({
			decision: "decline",
			projectId,
			suggestionId,
		}),
		{
			onSuccess,
			onError,
		},
	);

	const accept = useApiMutation(
		decideProjectSuggestion({
			decision: "accept",
			projectId,
			suggestionId,
		}),
		{
			onSuccess,
			onError,
		},
	);

	const reset = useApiMutation(
		decideProjectSuggestion({
			decision: "reset",
			projectId,
			suggestionId,
		}),
		{
			onSuccess,
			onError,
		},
	);

	return (
		<div className={cn("flex items-center gap-2 min-w-48 justify-end", className)} {...props}>
			{status === "pending" ? (
				<>
					<button
						type="button"
						disabled={disabledByStatus || decline.isPending}
						onClick={() => decline.mutate("decline")}
						className="text-sm font-medium px-2.5 py-1.5 h-7 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
					>
						<XIcon className="size-4 text-red-500" />
						Decline
					</button>
					<button
						type="button"
						disabled={disabledByStatus || accept.isPending}
						onClick={() => accept.mutate("accept")}
						className="text-sm font-medium px-2.5 py-1.5 h-7 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
					>
						<CheckIcon className="size-4 text-green-500" />
						Accept
					</button>
				</>
			) : (
				<>
					<button
						type="button"
						disabled={disabledByStatus || reset.isPending}
						onClick={() => reset.mutate("reset")}
						className="h-7 px-2.5 py-1 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
					>
						<RotateCcwIcon className="size-4 text-stone-500" />
						Reset decision
					</button>
				</>
			)}
		</div>
	);
}

export { SuggestionActions };
