import { Header } from "@/components/header";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ProjectsSidebar } from "@/modules/projects";

export default function TestLayout({ children }: { children: React.ReactNode }) {
	return (
		<SidebarProvider>
			<ProjectsSidebar />
			<div className="flex-1">
				<Header>
					<p>Hello world</p>
				</Header>
				<main>{children}</main>
			</div>
		</SidebarProvider>
	);
}
