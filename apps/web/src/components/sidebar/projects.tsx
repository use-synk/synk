"use client";

import { useApiQuery } from "@/api/client";
import { listOrganizationProjects } from "@/api/endpoints";
import { getErrorMessage } from "@/api/errors";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
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
	const { data, isLoading, isError, error } = useApiQuery(
		listOrganizationProjects({ slugOrId: organizationSlug, page: 1, pageSize: 10 }),
	);

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
						<div className="text-destructive px-2 py-1.5 rounded-md bg-destructive/10">
							<span className="whitespace-nowrap text-sm text-destructive truncate">
								{getErrorMessage(error)}
							</span>
						</div>
					)}
					{isLoading && <SidebarMenuSkeleton />}
					{!isLoading &&
						data &&
						data.data.map((project) => (
							<SidebarMenuItem key={project.id}>
								<SidebarMenuButton
									render={
										<Link href={`/${organizationSlug}/projects/${project.id}`}>{project.name}</Link>
									}
								/>
							</SidebarMenuItem>
						))}
					{!isLoading && data && data.data.length === 0 && (
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
