import type { suggestionDetailSchema } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type z from "zod";
import {
	StatusCallout,
	StatusCalloutContent,
	StatusCalloutDescription,
	StatusCalloutIcon,
	StatusCalloutTitle,
} from "./suggestion-callout";
import { SuggestionStatusIcon } from "./suggestion-status-icon";

function SuggestionCallouts({
	suggestion: { status, ...suggestion },
	className,
	...props
}: React.ComponentProps<"div"> & { suggestion: z.infer<typeof suggestionDetailSchema> }) {
	if (status === "pending") {
		return null;
	}

	return (
		<div className={cn("grid grid-cols-1 gap-6", className)} {...props}>
			{status === "superseded" && (
				<StatusCallout variant={"red"}>
					<StatusCalloutIcon>
						<SuggestionStatusIcon status={"superseded"} className="text-red-50" />
					</StatusCalloutIcon>
					<StatusCalloutContent>
						<StatusCalloutTitle>
							This suggestion was superseded{" "}
							{suggestion.supersedesSuggestionId && (
								// TODO: replace with readable id and actual suggestion link
								<>
									by <Link href={"#"}>another suggestion</Link>
								</>
							)}
						</StatusCalloutTitle>
						<StatusCalloutDescription>
							You can no longer accept or decline this suggestion.
						</StatusCalloutDescription>
					</StatusCalloutContent>
				</StatusCallout>
			)}
			{status === "applied" && (
				<StatusCallout variant={"violet"}>
					<StatusCalloutIcon>
						<SuggestionStatusIcon status={"applied"} className="text-violet-50" />
					</StatusCalloutIcon>
					<StatusCalloutContent>
						<StatusCalloutTitle>
							This suggestion was accepted and added
							{suggestion.appliedInBatchId && (
								// TODO: replace with readable id and actual batch link
								<>
									in batch <Link href={"#"}>#123</Link>
								</>
							)}
						</StatusCalloutTitle>
						<StatusCalloutDescription>
							You can no longer accept or decline this suggestion.
						</StatusCalloutDescription>
					</StatusCalloutContent>
				</StatusCallout>
			)}
		</div>
	);
}

export { SuggestionCallouts };
