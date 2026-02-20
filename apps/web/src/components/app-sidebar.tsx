import { OrganizationSwitcher } from "./organization-switcher";
import { Sidebar, SidebarHeader } from "./ui/sidebar";

export function AppSidebar({
	activeOrganizationSlug,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	activeOrganizationSlug: string;
}) {
	return (
		<Sidebar {...props}>
			<SidebarHeader>
				<OrganizationSwitcher activeOrganizationSlug={activeOrganizationSlug} />
			</SidebarHeader>
		</Sidebar>
	);
}
