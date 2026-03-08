import type { suggestionDetailSchema } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import { useMDXComponents } from "@/mdx-components";
import { BrainIcon } from "lucide-react";
import { compileMDX } from "next-mdx-remote/rsc";
import type z from "zod";

async function SuggestionReasoning({
	suggestion,
	className,
	...props
}: React.ComponentProps<"div"> & { suggestion: z.infer<typeof suggestionDetailSchema> }) {
	const mdx = await compileMDX({
		source: suggestion.reasoning ?? "",
		components: useMDXComponents(),
	});

	return (
		<div className={cn("space-y-2", className)} {...props}>
			<div className="flex justify-start items-center gap-2">
				<BrainIcon className="size-3.5 text-stone-500" />
				<p>AI Reasoning</p>
			</div>
			<div>{mdx.content}</div>
		</div>
	);
}

export { SuggestionReasoning };
