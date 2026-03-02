"use client";
import { suspenseQuery } from "@/api/client";
import { listOrganizationProjects } from "@/api/endpoints";
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
} from "../ui/sidebar";

export function SidebarProjects({ organizationSlug }: { organizationSlug: string }) {
	const { data } = suspenseQuery(
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
					{data.data.map((project) => (
						<SidebarMenuItem key={project.id}>
							<SidebarMenuButton
								render={
									<Link href={`/${organizationSlug}/projects/${project.id}`}>{project.name}</Link>
								}
							/>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
