"use client";

import { clientFetch } from "@/api/client";
import { decideProjectSuggestion, type suggestionSummarySchema } from "@/api/endpoints";
import { getQueryClient } from "@/api/make-query-client";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
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

	const mutation = useMutation({
		mutationFn: async (decision: "accept" | "decline" | "reset") => {
			const query = decideProjectSuggestion({
				projectId,
				suggestionId,
				decision,
			});
			const { data } = await clientFetch(query.url, query.init, query.response);
			return data;
		},
		onSuccess: async (_result, decision) => {
			await queryClient.invalidateQueries({
				queryKey: ["projects", projectId, "suggestions"],
			});
			router.refresh();
			if (decision === "accept") {
				toast.success("Suggestion accepted");
				return;
			}
			if (decision === "decline") {
				toast.success("Suggestion declined");
				return;
			}
			toast.success("Suggestion reset");
		},
		onError: (error) => {
			toast.error("Failed to update suggestion", {
				description: error.message,
			});
		},
	});

	return (
		<div className="flex items-center gap-2">
			<Button
				type="button"
				variant={status === "declined" ? "secondary" : "outline"}
				size="sm"
				disabled={disabledByStatus || mutation.isPending}
				onClick={() => mutation.mutate(status === "declined" ? "reset" : "decline")}
			>
				{status === "declined" ? "Reset" : "Decline"}
			</Button>
			<Button
				type="button"
				variant={status === "accepted" ? "secondary" : "default"}
				size="sm"
				disabled={disabledByStatus || mutation.isPending}
				onClick={() => mutation.mutate(status === "accepted" ? "reset" : "accept")}
			>
				{status === "accepted" ? "Reset" : "Accept"}
			</Button>
		</div>
	);
}
