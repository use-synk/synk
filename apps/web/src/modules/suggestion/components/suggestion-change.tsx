import type { suggestionDetailSchema } from "@/api/endpoints";
import { DiffView } from "@/components/suggestions/diff-view";
import { cn } from "@/lib/utils";
import type z from "zod";

function SuggestionChange({
	suggestion,
	className,
	...props
}: React.ComponentProps<"div"> & { suggestion: z.infer<typeof suggestionDetailSchema> }) {
	return (
		<div className={cn("rounded-xl bg-zinc-100 border border-stone-200", className)} {...props}>
			<div className="rounded-xl ring-1 ring-stone-200 overflow-hidden">
				<DiffView
					oldContent={suggestion.beforeContent ?? ""}
					newContent={suggestion.proposedContent}
					language="mdx"
					filename={suggestion.docPath}
				/>
			</div>
			<div className="px-4 py-2">
				<p className="max-w-xl text-xs text-stone-500">
					LLMs can make mistakes. Please review the reasoning before accepting or declining the
					suggestion.
				</p>
			</div>
		</div>
	);
}

export { SuggestionChange };
