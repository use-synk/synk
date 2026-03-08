"use client";

import { clientFetch, useApiSuspenseQuery } from "@/api/client";
import { createProject, listOrganizationRepositories } from "@/api/endpoints";
import { getQueryClient } from "@/api/make-query-client";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { BookOpenIcon, GitBranchIcon } from "lucide-react";
import { toast } from "sonner";
import { CreateProjectFormPrimitive } from "./project-create-form-primitive";

export function CreateProjectForm({
	className,
	organizationSlug,
	...props
}: React.ComponentProps<"div"> & {
	organizationSlug: string;
}) {
	const client = getQueryClient();
	const { data: result } = useApiSuspenseQuery(
		listOrganizationRepositories({ slugOrId: organizationSlug, page: 1, pageSize: 100 }),
	);

	const { mutate } = useMutation({
		mutationFn: async (body: Parameters<typeof createProject>[0]) => {
			const query = createProject(body);
			const { data } = await clientFetch(query.url, query.init, query.response);
			return data;
		},
		onError: (error) => {
			toast.error("Failed to create project", {
				description: error.message ?? "Unknown error occurred",
			});
		},
		onSuccess: () => {
			toast.success("Project created successfully");
			client.invalidateQueries({
				queryKey: ["organizations", organizationSlug, "projects"],
			});
		},
	});

	if (!result?.data)
		return (
			<div>
				<p>No repositories found.</p>
				<p>Result</p>
				<pre>{JSON.stringify(result, null, 2)}</pre>
			</div>
		);

	return (
		<div className={cn(className)} {...props}>
			<CreateProjectFormPrimitive
				repositories={result.data}
				onSubmit={({ name, sourceRepository, targetRepository }) => {
					mutate({
						name,
						slugOrId: organizationSlug,
						docsRepositoryId: targetRepository,
						sourceRepositoryId: sourceRepository,
					});
				}}
				render={({ Form, Source, Target, Complete }) => (
					<Form className="space-y-8">
						<div className="rounded-lg ">
							<div className="px-4 w-[calc(100%-32px)] mx-auto rounded-t-lg bg-zinc-50 py-2 border border-zinc-200 border-b-0">
								<p className="text-xs font-medium text-lime-600 flex justify-start items-center gap-2">
									<GitBranchIcon className="size-3 " />
									Documentation repository
								</p>
							</div>
							<div className="p-8 rounded-lg ring-1 ring-zinc-700/10 shadow-xl shadow-zinc-700/5 overflow-hidden bg-background">
								<Target />
							</div>
						</div>

						<div className="rounded-lg ">
							<div className="px-4 w-[calc(100%-32px)] mx-auto rounded-t-lg bg-zinc-50 py-2 border border-zinc-200 border-b-0">
								<p className="text-xs font-medium text-lime-600 flex justify-start items-center gap-2">
									<BookOpenIcon className="size-3 " />
									Source repository
								</p>
							</div>
							<div className="p-8 rounded-lg ring-1 ring-zinc-700/10 shadow-xl shadow-zinc-700/5 overflow-hidden bg-background">
								<Source />
							</div>
						</div>

						<Complete />
					</Form>
				)}
			/>
		</div>
	);
}
