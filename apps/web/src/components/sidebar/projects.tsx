"use client";

import { useApiQuery } from "@/api/client";
import { listUserProjectsByOrganization } from "@/api/endpoints";
import { getErrorMessage } from "@/api/errors";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import {
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
} from "../ui/sidebar";

export function SidebarProjects({ organizationSlug }: { organizationSlug: string }) {
	const { data, isLoading, isError, error } = useApiQuery(listUserProjectsByOrganization());
	const projects = useMemo(() => {
		const activeOrganization = data?.data.find(
			(item) => item.organization.slug === organizationSlug,
		);

		return activeOrganization?.projects ?? [];
	}, [data, organizationSlug]);

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Projects</SidebarGroupLabel>
			<SidebarGroupAction
				render={
					<Link href={`/${organizationSlug}/projects/new`}>
						<PlusIcon />
						<span className="sr-only">New project</span>
					</Link>
				}
			/>
			<SidebarGroupContent>
				<SidebarMenu>
					{isError && (
						<SidebarMenuItem aria-disabled>
							<div className="text-destructive px-2 py-1.5 rounded-md bg-destructive/10">
								<span className="whitespace-nowrap text-sm text-destructive truncate">
									{getErrorMessage(error)}
								</span>
							</div>
						</SidebarMenuItem>
					)}
					{isLoading && (
						<SidebarMenuItem aria-disabled>
							<SidebarMenuSkeleton />
						</SidebarMenuItem>
					)}
					{!isLoading &&
						projects.map((project) => (
							<SidebarMenuItem key={project.id}>
								<SidebarMenuButton
									render={
										<Link href={`/${organizationSlug}/projects/${project.id}`}>{project.name}</Link>
									}
								/>
							</SidebarMenuItem>
						))}
					{!isLoading && projects.length === 0 && (
						<SidebarMenuItem aria-disabled>
							<div className="rounded-md border border-dashed p-2 text-sm flex justify-center items-center">
								No projects found
							</div>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
