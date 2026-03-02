import { listOrganizationProjects, listUserOrganizations } from "@/api/endpoints";
import { getQueryClient } from "@/api/make-query-client";
import { prefetchQuery } from "@/api/server";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { HomeIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { OrganizationSwitcher } from "../organization-switcher";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
} from "../ui/sidebar";
import { SidebarProjects } from "./projects";

export async function AppSidebar({
	activeOrganizationSlug,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	activeOrganizationSlug: string;
}) {
	await prefetchQuery(listUserOrganizations());
	await prefetchQuery(
		listOrganizationProjects({ slugOrId: activeOrganizationSlug, page: 1, pageSize: 10 }),
	);
	const client = getQueryClient();

	return (
		<HydrationBoundary state={dehydrate(client)}>
			<Sidebar {...props}>
				<SidebarHeader>
					<Suspense fallback={<div>Loading organizations...</div>}>
						<OrganizationSwitcher activeOrganizationSlug={activeOrganizationSlug} />
					</Suspense>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarMenu>
							<SidebarMenuItem>
								<SidebarMenuButton
									render={
										<Link href={`/${activeOrganizationSlug}`}>
											<HomeIcon className="text-muted-foreground" />
											Dashboard
										</Link>
									}
								/>
							</SidebarMenuItem>
						</SidebarMenu>
					</SidebarGroup>
					<Suspense fallback={<SidebarMenuSkeleton />}>
						<SidebarProjects organizationSlug={activeOrganizationSlug} />
					</Suspense>
				</SidebarContent>
			</Sidebar>
		</HydrationBoundary>
	);
}
