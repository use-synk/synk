"use client";

import { authClient } from "@/server/better-auth/client";
import {
	ArrowUpRightIcon,
	ChevronRightIcon,
	LifeBuoyIcon,
	LogOutIcon,
	SettingsIcon,
	SunIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";

function UserMenu({ ...props }: React.ComponentProps<typeof DropdownMenu>) {
	const { data, isPending } = authClient.useSession();

	if (isPending) {
		return <Skeleton className={"w-full h-8"} />;
	}

	return (
		<DropdownMenu {...props}>
			<DropdownMenuTrigger
				render={
					<Button variant={"ghost"} className={"w-full"}>
						<Avatar className={"size-4"}>
							<AvatarImage src={data?.user?.image ?? undefined} alt={data?.user?.name ?? ""} />
							<AvatarFallback>{data?.user?.name?.charAt(0) ?? ""}</AvatarFallback>
						</Avatar>
						<span className="truncate">{data?.user?.name ?? "Not signed in"}</span>
						<ChevronRightIcon className="shrink-0 ml-auto" />
					</Button>
				}
			/>
			<DropdownMenuContent side="right">
				<DropdownMenuGroup>
					<DropdownMenuItem>
						<LifeBuoyIcon className="text-stone-500!" /> Support{" "}
						<ArrowUpRightIcon className="shrink-0 ml-auto text-stone-500!" />
					</DropdownMenuItem>
					<DropdownMenuItem>
						<SunIcon className="text-stone-500!" /> Change theme
					</DropdownMenuItem>
					<DropdownMenuItem>
						<SettingsIcon className="text-stone-500!" /> Settings
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem variant="destructive">
						<LogOutIcon /> Log out{" "}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { UserMenu };
