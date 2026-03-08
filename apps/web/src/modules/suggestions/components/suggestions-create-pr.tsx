import { cn } from "@/lib/utils";
import { GitPullRequestIcon } from "lucide-react";

function CreateSuggestionsPR({ className, ...props }: React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			className={cn(
				"text-sm font-medium text-center px-2.5 h-7 rounded-sm bg-linear-to-b from-violet-500 to-violet-600 text-violet-50 border border-violet-600 inset-shadow-2xs inset-shadow-white/25 shadow-xs shadow-violet-500/30 [&_svg:not([class*='size-'])]:size-3.5 [&_svg:not([class*='text-'])]:text-violet-200 flex justify-center items-center gap-2 cursor-pointer",
				className,
			)}
			{...props}
		>
			<GitPullRequestIcon />
			Create PR
		</button>
	);
}

export { CreateSuggestionsPR };
