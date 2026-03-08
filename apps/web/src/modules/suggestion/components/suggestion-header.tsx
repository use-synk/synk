import type { suggestionDetailSchema } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type z from "zod";
import { SuggestionActions } from "./suggestion-actions";
import { SuggestionStatusIcon } from "./suggestion-status-icon";

function SuggestionHeader({
	suggestion,
	className,
	...props
}: React.ComponentProps<"header"> & { suggestion: z.infer<typeof suggestionDetailSchema> }) {
	return (
		<header
			className={cn("flex justify-between items-start gap-12 flex-wrap md:flex-nowrap", className)}
			{...props}
		>
			<div className="flex justify-start items-start gap-4">
				<SuggestionStatusIcon status={suggestion.status} className="size-5  shrink-0 mt-1" />
				<div>
					<h1 className="text-xl font-medium text-stone-800 max-w-2xl">
						<span className="text-stone-500">#{suggestion.readableId}</span> {suggestion.title}
					</h1>
					<p className="text-sm mt-2 text-stone-500">
						Last updated {formatDistanceToNow(new Date(suggestion.updatedAt), { addSuffix: true })}
						{suggestion.decidedByUser && (
							<span>
								{" "}
								by{" "}
								<span className="text-lime-600 font-medium">{suggestion.decidedByUser.name}</span>
							</span>
						)}
					</p>
				</div>
			</div>
			<SuggestionActions
				projectId={suggestion.projectId}
				suggestionId={suggestion.id}
				status={suggestion.status}
			/>
		</header>
	);
}

export { SuggestionHeader };
