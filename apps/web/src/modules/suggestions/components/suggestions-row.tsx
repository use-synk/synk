import type { suggestionSummarySchema } from "@/api/endpoints";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SuggestionStatusIcon } from "@/modules/suggestion/components/suggestion-status-icon";
import { formatDistanceToNow } from "date-fns";
import { UserCircle2Icon } from "lucide-react";
import Link from "next/link";
import type z from "zod";

function SuggestionsRow({
	suggestion,
	detailHref,
}: {
	suggestion: z.infer<typeof suggestionSummarySchema>;
	detailHref: string;
}) {
	return (
		<Link
			href={detailHref}
			scroll={false}
			className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-500 rounded-md"
		>
			<div
				className={cn(
					"flex justify-start items-center gap-2 h-11 px-4 py-1 hover:bg-stone-50 transition-colors",
					suggestion.status === "superseded" && "opacity-60",
				)}
			>
				<SuggestionStatusIcon status={suggestion.status} className="size-4" />
				<p className="text-sm font-medium text-stone-800 ml-2">
					<span className="text-sm text-stone-500">#{suggestion.readableId}:</span>{" "}
					{suggestion.title ?? "Untitled suggestion"}
				</p>
				<Badge variant="outline" className="font-normal text-stone-500 ml-2">
					{suggestion.docPath}
				</Badge>
				<div className="flex justify-center items-center gap-1 ml-2">
					<span className="text-xs text-green-500 font-medium">+{suggestion.diffAdditions}</span>
					<span className="text-xs text-red-500 font-medium">-{suggestion.diffDeletions}</span>
				</div>
				<p className="text-sm text-stone-500 ml-auto">
					{formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
				</p>
				<div className="ml-2">
					{suggestion.decidedByUser !== null ? (
						<Avatar className="shrink-0 size-4">
							<AvatarImage src={suggestion.decidedByUser.image ?? ""} />
							<AvatarFallback>{suggestion.decidedByUser.name.charAt(0)}</AvatarFallback>
						</Avatar>
					) : (
						<UserCircle2Icon className="size-4 text-stone-500" />
					)}
				</div>
			</div>
		</Link>
	);
}

export { SuggestionsRow };