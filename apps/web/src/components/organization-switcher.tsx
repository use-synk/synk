"use client";

import { useApiQuery } from "@/api/client";
import { listUserOrganizations } from "@/api/endpoints";
import { getErrorMessage } from "@/api/errors";
import { ChevronDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { Fragment, useMemo, useState } from "react";
import { CreateOrganizationForm } from "./forms/org/create";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";

export function OrganizationSwitcher({
	activeOrganizationSlug,
	...props
}: React.ComponentProps<typeof DropdownMenu> & {
	activeOrganizationSlug: string;
}) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const router = useRouter();
	const { data, isPending, isError, error } = useApiQuery(listUserOrganizations());

	const activeOrganization = useMemo(() => {
		if (!data) return null;

		return data.data.find((org) => org.slug === activeOrganizationSlug);
	}, [data, activeOrganizationSlug]);

	if (isError) {
		return (
			<div className="text-destructive px-2 py-1.5 rounded-md bg-destructive/10">
				<span className="whitespace-nowrap text-sm text-destructive truncate">
					{getErrorMessage(error)}
				</span>
			</div>
		);
	}

	if (isPending) {
		return <Skeleton className="w-full h-8 rounded-md" />;
	}

	if (!data) {
		return <Skeleton className="w-full h-8 rounded-md" />;
	}

	return (
		<Fragment>
			<DropdownMenu {...props}>
				<DropdownMenuTrigger
					render={
						<Button variant={"ghost"} className={"w-fit max-w-full"}>
							<Avatar className={"size-5 "}>
								<AvatarImage
									src={activeOrganization?.logo ?? undefined}
									alt={activeOrganization?.name}
								/>
								<AvatarFallback className={"text-xs"}>
									{activeOrganization?.name.charAt(0)}
								</AvatarFallback>
							</Avatar>
							<span className="truncate">{activeOrganization?.name}</span>
							<ChevronDownIcon className="shrink-0" />
						</Button>
					}
				/>
				<DropdownMenuContent className={"min-w-48"}>
					<DropdownMenuGroup>
						<DropdownMenuLabel>Organizations</DropdownMenuLabel>

						{data.data.map((org) => (
							<DropdownMenuItem
								key={org.id}
								render={
									<Link href={`/${org.slug}`}>
										<Avatar className={"size-5 "}>
											<AvatarImage src={org.logo ?? undefined} alt={org.name} />
											<AvatarFallback className={"text-xs"}>{org.name.charAt(0)}</AvatarFallback>
										</Avatar>
										<span className="truncate">{org.name}</span>
									</Link>
								}
							/>
						))}
					</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={() => setDialogOpen(true)}>
							<PlusIcon />
							New Organization
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="md:max-w-lg">
					<DialogHeader>
						<DialogTitle>New Organization</DialogTitle>
						<DialogDescription>Create a new organization to get started.</DialogDescription>
					</DialogHeader>
					<div>
						<CreateOrganizationForm
							onSuccess={(org) => {
								setDialogOpen(false);
								router.push(`/${org.slug}`);
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>
		</Fragment>
	);
}
