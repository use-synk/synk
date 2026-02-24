import { cn } from "@/lib/utils";
import { Navbar } from "./ui/navbar";

export function SiteNav({
	className,
	breadcrumb,
	...props
}: React.ComponentProps<"nav"> & { breadcrumb: React.ReactNode }) {
	return (
		<Navbar className={cn("", className)} {...props}>
			{breadcrumb}
		</Navbar>
	);
}
