"use client";

import type { Repository } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";
import { BookOpenIcon, GitBranchIcon } from "lucide-react";
import { CreateProjectFormPrimitive } from "./create-project-form-primitive";

export function CreateProjectForm({
	className,
	repositories,
	...props
}: React.ComponentProps<"div"> & {
	repositories: Repository[];
}) {
	return (
		<div className={cn(className)} {...props}>
			<CreateProjectFormPrimitive
				repositories={repositories}
				onSubmit={() => {}}
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
