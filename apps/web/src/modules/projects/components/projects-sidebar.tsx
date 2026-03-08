import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ProjectsSidebarMenu } from "./projects-sidebar-menu";
import { ProjectsSwitcher } from "./projects-switcher";

function ProjectsSidebar({ className, ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar className={cn("", className)} {...props}>
			<SidebarHeader className="h-header border-b border-stone-200 flex justify-center items-start">
				<ProjectsSwitcher />
			</SidebarHeader>
			<SidebarContent className="py-[calc(var(--height-header)-(var(--spacing)*2))]">
				<SidebarGroup className="pt-0">
					<ProjectsSidebarMenu />
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}

export { ProjectsSidebar };
