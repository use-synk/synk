import { SidebarCallout } from "@/components/sidebar-callout";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { ProjectsSidebarMenu } from "./projects-sidebar-menu";
import { ProjectsSwitcher } from "./projects-switcher";

function ProjectsSidebar({ className, ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar className={cn("", className)} {...props}>
			<SidebarHeader className="h-header border-b border-stone-200 flex justify-center items-start">
				<ProjectsSwitcher />
			</SidebarHeader>
			<SidebarContent className="py-[calc(var(--height-header)-(var(--spacing)*4))]">
				<SidebarGroup className="pt-0">
					<SidebarGroupLabel>Navigation</SidebarGroupLabel>
					<ProjectsSidebarMenu />
				</SidebarGroup>
				<SidebarGroup className="mt-auto">
					<SidebarCallout
						title="Help us improve Synk"
						desc="Receive free credits as a thank you for helping us improve Synk."
						link="https://support.example.com"
						linkText="Get in touch"
					/>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="border-t border-stone-200">
				<UserMenu />
			</SidebarFooter>
		</Sidebar>
	);
}

export { ProjectsSidebar };
