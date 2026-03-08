import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { ProjectsSidebarMenu } from "./projects-sidebar-menu";

function ProjectsSidebar({ className, ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar className={cn("", className)} {...props}>
			<SidebarHeader className="h-header border-b border-stone-200">
				<p>Hello world</p>
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
