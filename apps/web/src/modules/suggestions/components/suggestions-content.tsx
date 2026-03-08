import { cn } from "@/lib/utils";
import { Fragment } from "react";
import { SuggestionsList } from "./suggestions-list";
import { SuggestionsNavbar } from "./suggestions-navbar";

function SuggestionsContent({
	projectId,
	className,
	...props
}: React.ComponentProps<"main"> & { projectId: string }) {
	return (
		<Fragment>
			<SuggestionsNavbar projectId={projectId} />
			<main className={cn("py-page-vertical", className)} {...props}>
				<section>
					<div className="max-w-7xl w-full px-8 mx-auto">
						<SuggestionsList projectId={projectId} />
					</div>
				</section>
			</main>
		</Fragment>
	);
}

export { SuggestionsContent };
