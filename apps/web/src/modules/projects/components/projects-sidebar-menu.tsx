"use client";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { BrainIcon, HomeIcon, WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type React from "react";
import { useMemo } from "react";

const items = [
	{
		label: "Home",
		icon: HomeIcon,
		href: "/",
	},
	{
		label: "Runs",
		icon: WorkflowIcon,
		href: "/runs",
	},
	{
		label: "Suggestions",
		icon: BrainIcon,
		href: "/suggestions",
	},
];

function ProjectsSidebarMenu({ ...props }: React.ComponentProps<typeof SidebarMenu>) {
	const pathname = usePathname();
	const { project, slug } = useParams<{ project: string; slug: string }>();
	const basePath = useMemo(() => {
		return `/${slug}/project/${project}`;
	}, [slug, project]);

	return (
		<SidebarMenu {...props}>
			{items.map(({ label, icon: Icon, href }) => (
				<SidebarMenuItem key={href}>
					<SidebarMenuButton
						isActive={pathname === `${basePath}${href === "/" ? "" : href}`}
						render={
							<Link href={`${basePath}${href}`}>
								<Icon />
								{label}
							</Link>
						}
					/>
				</SidebarMenuItem>
			))}
		</SidebarMenu>
	);
}

export { ProjectsSidebarMenu };
