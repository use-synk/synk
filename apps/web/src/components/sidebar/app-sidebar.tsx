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
				<SidebarProjects organizationSlug={activeOrganizationSlug} />
			</SidebarContent>
		</Sidebar>
	);
}
