"use client";

import { useApiQuery } from "@/api/client";
import { listUserProjectsByOrganization } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";

function ProjectsSwitcher() {
	const { project, slug } = useParams<{ slug: string; project: string }>();
	const { data, isLoading, isError, error } = useApiQuery(listUserProjectsByOrganization());
	const _activeProject = useMemo(() => {
		if (!data) return null;

		return data.data
			.find((org) => org.organization.slug === slug)
			?.projects.find((p) => p.id === project);
	}, [project, slug, data]);

	if (isLoading) {
		return <Skeleton className="h-6 w-full max-w-20" />;
	}

	if (isError || !data) {
		return (
			<div className="text-destructive px-2 py-1.5 rounded-md bg-destructive/10 truncate">
				{error?.message}
			</div>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button variant={"ghost"} size={"sm"} className={"w-fit"}>
						<span className="truncate">{_activeProject?.name}</span>
						<ChevronDownIcon className="size-4! mt-0.25 text-stone-500 ms-1" />
					</Button>
				}
			/>
			<DropdownMenuContent>
				<DropdownMenuGroup>
					{data.data.map((org) => (
						<DropdownMenuSub key={org.organization.id}>
							<DropdownMenuSubTrigger>{org.organization.name}</DropdownMenuSubTrigger>
							<DropdownMenuPortal>
								<DropdownMenuSubContent>
									{org.projects.map((project) => (
										<DropdownMenuItem
											key={project.id}
											render={
												<Link href={`/${org.organization.slug}/project/${project.id}`}>
													{project.name}
													{project.id === _activeProject?.id && (
														<CheckIcon className="size-4! ms-1 text-stone-500 mt-0.25" />
													)}
												</Link>
											}
										/>
									))}
									{org.projects.length === 0 && (
										<Empty>
											<EmptyContent>
												<EmptyTitle>No projects found</EmptyTitle>
											</EmptyContent>
										</Empty>
									)}
								</DropdownMenuSubContent>
							</DropdownMenuPortal>
						</DropdownMenuSub>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { ProjectsSwitcher };
