import { api } from "@/server/api";
import { getApiRequestHeaders } from "@/server/api/request-headers";
import { getQueryClient } from "@/server/api/tanstack-query/make-query-client";
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
	const { options } = api("/organizations/:slugOrId/projects", "GET");
	const client = getQueryClient();
	const requestHeaders = await getApiRequestHeaders();
	void (await client.prefetchQuery(
		options({
			params: { slugOrId: activeOrganizationSlug },
			query: { page: 1, pageSize: 10 },
			headers: requestHeaders,
		}),
	));

	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<OrganizationSwitcher activeOrganizationSlug={activeOrganizationSlug} />
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
				<HydrationBoundary state={dehydrate(client)}>
					<Suspense fallback={<SidebarMenuSkeleton />}>
						<SidebarProjects organizationSlug={activeOrganizationSlug} />
					</Suspense>
				</HydrationBoundary>
			</SidebarContent>
		</Sidebar>
	);
}
