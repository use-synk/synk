import { listUserProjectsByOrganization } from "@/api/endpoints";
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
} from "../ui/sidebar";
import { SidebarProjects } from "./projects";

export async function AppSidebar({
	activeOrganizationSlug,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	activeOrganizationSlug: string;
}) {
	const { client } = await prefetchQuery(
		listUserProjectsByOrganization(),
	);

	return (
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
				<HydrationBoundary state={dehydrate(client)}>
					<SidebarProjects organizationSlug={activeOrganizationSlug} />
				</HydrationBoundary>
			</SidebarContent>
		</Sidebar>
	);
}
