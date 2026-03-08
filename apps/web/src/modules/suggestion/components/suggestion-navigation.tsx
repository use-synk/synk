import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

function SuggestionNavigation({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={cn("flex justify-center items-center gap-2", className)} {...props}>
			<button
				type="button"
				className="text-sm font-medium px-2.5 py-1.5 h-7 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
			>
				<ChevronLeftIcon className="size-4 text-stone-500" />
				Previous
			</button>
			<button
				type="button"
				className="text-sm font-medium px-2.5 py-1.5 h-7 rounded-sm ring-1 ring-stone-700/10 shadow-sm text-stone-800 bg-linear-to-b from-background to-stone-50 flex justify-center items-center gap-2 transition-all duration-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
			>
				Next
				<ChevronRightIcon className="size-4 text-stone-500" />
			</button>
		</div>
	);
}

export { SuggestionNavigation };
