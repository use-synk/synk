import type { suggestionDetailSchema } from "@/api/endpoints";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Fragment } from "react";
import type z from "zod";
import { SuggestionCallouts } from "./suggestion-callouts";
import { SuggestionChange } from "./suggestion-change";
import { SuggestionHeader } from "./suggestion-header";
import { SuggestionNavbar } from "./suggestion-navbar";
import { SuggestionNavigation } from "./suggestion-navigation";
import { SuggestionReasoning } from "./suggestion-reasoning";
import { SuggestionSidebar } from "./suggestion-sidebar";

function SuggestionContent({
	suggestion,
	className,
	projectId,
	orgSlug,
	...props
}: React.ComponentProps<"main"> & {
	suggestion: z.infer<typeof suggestionDetailSchema>;
	projectId: string;
	orgSlug: string;
}) {
	return (
		<Fragment>
			<SuggestionNavbar projectId={suggestion.projectId} />
			<main className={cn("py-page-vertical", className)} {...props}>
				<section>
					<div className="max-w-7xl w-full px-8 mx-auto">
						<div className="mb-10">
							<Link
								className="text-sm font-medium text-stone-700 flex justify-center items-center w-fit gap-1.5"
								href={`/${orgSlug}/project/${projectId}/suggestions`}
							>
								<ArrowLeftIcon className="size-3.5 text-stone-500" />
								<span>Back to suggestions</span>
							</Link>
						</div>
						<SuggestionHeader suggestion={suggestion} />
						<Separator className={"mt-10"} />
					</div>
				</section>
				<div className="flex max-w-7xl w-full mx-auto px-8 gap-12 mt-12">
					<section className="flex-1">
						{/* Safe to set the margin since callouts wrapper will only be rendered if any callout is present */}
						<SuggestionCallouts suggestion={suggestion} className="mb-12" />
						<SuggestionReasoning suggestion={suggestion} className="mb-8" />
						<SuggestionChange suggestion={suggestion} />
						<div className="mt-12 flex justify-between items-start gap-8 flex-wrap">
							<p className="text-xs text-stone-500">
								Having issues with the suggestion?{" "}
								<Link href={"#"} className="text-lime-500 font-medium">
									Contact support
								</Link>
							</p>
							<SuggestionNavigation />
						</div>
					</section>
					<SuggestionSidebar suggestion={suggestion} />
				</div>
			</main>
		</Fragment>
	);
}

export { SuggestionContent };
