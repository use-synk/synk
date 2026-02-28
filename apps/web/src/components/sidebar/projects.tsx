"use client";
import { api } from "@/server/api";
import { useSuspenseQuery } from "@tanstack/react-query";
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
	const { options } = api("/organizations/:slugOrId/projects", "GET");
	const { data } = useSuspenseQuery(
		options({
			params: {
				slugOrId: organizationSlug,
			},
			query: {
				page: 1,
				pageSize: 10,
			},
		}),
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
