"use client";
import { api } from "@/server/api";
import { useSuspenseQuery } from "@tanstack/react-query";

export function ProjectsList({ organizationId }: { organizationId: string }) {
	const { options } = api("/project/:organizationId", "GET");

	const {
		data: { data: projects },
	} = useSuspenseQuery(options({ params: { organizationId }, query: { page: 1, pageSize: 12 } }));

	if (projects.length === 0) {
		return <div>No projects found</div>;
	}

	return (
		<div>
			{projects.map((project) => {
				return (
					<div key={project.id}>
						<h2>{project.name}</h2>
					</div>
				);
			})}
		</div>
	);
}
