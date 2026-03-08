import { cn } from "@/lib/utils";
import type { SuggestionStatus } from "@synk-ai/db/client";
import {
	GitMergeConflictIcon,
	GitMergeIcon,
	GitPullRequestArrowIcon,
	GitPullRequestClosedIcon,
	GitPullRequestDraftIcon,
	GitPullRequestIcon,
	XIcon,
} from "lucide-react";

function SuggestionStatusIcon({
	status,
	className,
	...props
}: React.ComponentProps<"svg"> & { status: SuggestionStatus }) {
	switch (status) {
		case "accepted":
			return <GitPullRequestArrowIcon className={cn("text-green-500", className)} {...props} />;
		case "applied":
			return <GitPullRequestIcon className={cn("text-violet-500", className)} {...props} />;
		case "declined":
			return <GitPullRequestClosedIcon className={cn("text-red-500", className)} {...props} />;
		case "pending":
			return <GitPullRequestDraftIcon className={cn("text-gray-500", className)} {...props} />;
		case "stale":
			return <GitMergeIcon className={cn("text-gray-500", className)} {...props} />;
		case "superseded":
			return <GitMergeConflictIcon className={cn("text-red-500", className)} {...props} />;
		default:
			return <XIcon className={cn("text-gray-500", className)} {...props} />;
	}
}

export { SuggestionStatusIcon };
