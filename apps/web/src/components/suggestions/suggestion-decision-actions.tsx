"use client";

import { useApiMutation } from "@/api/client";
import {
	decideProjectSuggestion,
	getProjectSuggestionStats,
	type suggestionSummarySchema,
} from "@/api/endpoints";
import { getQueryClient } from "@/api/make-query-client";
import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type z from "zod";

type SuggestionStatus = z.infer<typeof suggestionSummarySchema>["status"];

const INVALID_TRANSITION_STATUSES: readonly SuggestionStatus[] = ["superseded", "stale", "applied"];

type SuggestionDecisionActionsProps = {
	projectId: string;
	suggestionId: string;
	status: SuggestionStatus;
};

export function SuggestionDecisionActions({
	projectId,
	suggestionId,
	status,
}: SuggestionDecisionActionsProps) {
	const queryClient = getQueryClient();
	const router = useRouter();
	const disabledByStatus = INVALID_TRANSITION_STATUSES.includes(status);

	const decline = useApiMutation(
		decideProjectSuggestion({
			decision: "decline",
			projectId,
			suggestionId,
		}),
		{
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: getProjectSuggestionStats({ projectId }).key,
				});
				router.refresh();
			},

			onError: (error) => {
				toast.error("Failed to update suggestion", {
					description: error.message,
				});
			},
		},
	);

	const accept = useApiMutation(
		decideProjectSuggestion({
			decision: "accept",
			projectId,
			suggestionId,
		}),
		{
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: getProjectSuggestionStats({ projectId }).key,
				});
				router.refresh();
			},
			onError: (error) => {
				toast.error("Failed to update suggestion", {
					description: error.message,
				});
			},
		},
	);

	const reset = useApiMutation(
		decideProjectSuggestion({
			decision: "reset",
			projectId,
			suggestionId,
		}),
		{
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: getProjectSuggestionStats({ projectId }).key,
				});
				router.refresh();
			},
			onError: (error) => {
				toast.error("Failed to update suggestion", {
					description: error.message,
				});
			},
		},
	);

	return (
		<div className="flex items-center gap-2">
			{status === "pending" ? (
				<>
					<button
						type="button"
						disabled={disabledByStatus || decline.isPending}
						onClick={() => decline.mutate("decline")}
						className="h-7 px-2.5 py-1 rounded-sm bg-linear-to-b from-red-400 to-red-500 border border-red-500/10 text-white inset-shadow-2xs inset-shadow-red-300 flex justify-center items-center gap-2 hover:from-red-500 transition-all duration-500 cursor-pointer text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<XIcon className="size-4 text-red-200" />
						Decline
					</button>
					<button
						type="button"
						disabled={disabledByStatus || accept.isPending}
						onClick={() => accept.mutate("accept")}
						className="h-7 px-2.5 py-1 rounded-sm bg-linear-to-b from-green-400 to-green-500 border border-green-500/10 text-white inset-shadow-2xs inset-shadow-green-300 flex justify-center items-center gap-2 hover:from-green-500 transition-all duration-500 cursor-pointer text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<CheckIcon className="size-4 text-green-200" />
						Accept
					</button>
				</>
			) : (
				<>
					<button
						type="button"
						disabled={disabledByStatus || reset.isPending}
						onClick={() => reset.mutate("reset")}
						className="h-7 px-2.5 py-1 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<RotateCcwIcon className="size-4 text-stone-500" />
						Reset decision
					</button>
				</>
			)}
		</div>
	);
}
