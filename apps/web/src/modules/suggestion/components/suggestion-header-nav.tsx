import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";

function SuggestionHeaderNav({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={cn("flex justify-center items-center gap-0.25", className)} {...props}>
			<Tooltip>
				<TooltipTrigger>
					<Button variant={"ghost"} size={"icon-xs"}>
						<ChevronDownIcon className="size-4!" />
						<span className="sr-only">Navigate down</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					Navigate down
					<Kbd className="ml-2">J</Kbd>
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger>
					<Button variant={"ghost"} size={"icon-xs"}>
						<ChevronUpIcon className="size-4!" />
						<span className="sr-only">Navigate up</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					Navigate up
					<Kbd className="ml-2">K</Kbd>
				</TooltipContent>
			</Tooltip>
		</div>
	);
}

export { SuggestionHeaderNav };
