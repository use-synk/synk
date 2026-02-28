"use client";

import { cn } from "@/lib/utils";
import { api } from "@/server/api";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { BookOpenIcon, GitBranchIcon } from "lucide-react";
import { toast } from "sonner";
import { CreateProjectFormPrimitive } from "./create-project-form-primitive";

export function CreateProjectForm({
	className,
	organizationSlug,
	...props
}: React.ComponentProps<"div"> & {
	organizationSlug: string;
}) {
	const { options } = api("/project/organizations/:slugOrId/repositories", "GET");
	const { data: result, isLoading } = useSuspenseQuery(
		options({
			params: { slugOrId: organizationSlug },
			query: { page: 1, pageSize: 100 },
		}),
	);

	const { $fetch } = api("/project", "POST");
	const { mutate } = useMutation({
		mutationFn: $fetch,
		onError: (error) => {
			toast.error("Failed to create project", {
				description: error.message ?? "Unknown error occurred",
			});
		},
		onSuccess: () => {
			toast.success("Project created successfully");
		},
	});

	if (isLoading) return <p>Loading...</p>;

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
				onSubmit={({ sourceRepository, targetRepository }) => {
					mutate({
						body: {
							name: "test project",
							slugOrId: organizationSlug,
							docsRepositoryId: targetRepository,
							sourceRepositoryId: sourceRepository,
						},
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
