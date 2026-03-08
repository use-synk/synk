import type { suggestionDetailSchema } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { UserCircle2Icon } from "lucide-react";
import type React from "react";
import type z from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { translateSuggestionStatus } from "../lib/translate-suggestion-status";
import { SuggestionStatusIcon } from "./suggestion-status-icon";

function SuggestionSidebar({
	suggestion,
	className,
	...props
}: React.ComponentProps<"aside"> & { suggestion: z.infer<typeof suggestionDetailSchema> }) {
	return (
		<aside className={cn("max-w-52 w-full border-l border-stone-200 pl-8", className)} {...props}>
			<div className="grid gap-6">
				<SidebarItem>
					<SidebarItemLabel>Reviewers</SidebarItemLabel>
					<SidebarItemValue className="flex justify-start items-center gap-2">
						{suggestion.decidedByUser ? (
							<>
								<Avatar className={"size-3.5"}>
									<AvatarImage src={suggestion.decidedByUser.image ?? ""} />
									<AvatarFallback>{suggestion.decidedByUser.name.charAt(0)}</AvatarFallback>
								</Avatar>
								<p>{suggestion.decidedByUser.name}</p>
							</>
						) : (
							<>
								<UserCircle2Icon className="size-3.5 text-stone-500" />
								<p>Unassigned</p>
							</>
						)}
					</SidebarItemValue>
				</SidebarItem>
				<SidebarItem>
					<SidebarItemLabel>Created</SidebarItemLabel>
					<SidebarItemValue>
						<p>
							{formatDistanceToNow(new Date(suggestion.createdAt), {
								addSuffix: true,
							})}
						</p>
					</SidebarItemValue>
				</SidebarItem>
				<SidebarItem>
					<SidebarItemLabel>Status</SidebarItemLabel>
					<SidebarItemValue>
						<SuggestionStatusIcon className="size-3.5" status={suggestion.status} />
						<p>{translateSuggestionStatus(suggestion.status)}</p>
					</SidebarItemValue>
				</SidebarItem>
			</div>
		</aside>
	);
}

function SidebarItem({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("space-y-1.5", className)} {...props} />;
}

function SidebarItemLabel({ className, ...props }: React.ComponentProps<"p">) {
	return <p className={cn("text-xs text-stone-500 font-medium", className)} {...props} />;
}

function SidebarItemValue({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"text-sm text-stone-700 font-normal flex justify-start items-center gap-2",
				className,
			)}
			{...props}
		/>
	);
}

export { SuggestionSidebar };
