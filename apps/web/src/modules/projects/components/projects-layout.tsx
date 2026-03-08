import { SidebarProvider } from "@/components/ui/sidebar";
import { ProjectsSidebar } from "./projects-sidebar";

function ProjectsLayout({ children, ...props }: React.ComponentProps<typeof SidebarProvider>) {
	return (
		<SidebarProvider {...props}>
			<ProjectsSidebar />
			<div className="flex-1">{children}</div>
		</SidebarProvider>
	);
}
export { ProjectsLayout };
