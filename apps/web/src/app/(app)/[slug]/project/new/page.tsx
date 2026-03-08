import { listOrganizationRepositories } from "@/api/endpoints";
import { prefetchQuery } from "@/api/server";
import { PageDescription, PageTitle } from "@/components/typography";
import { Separator } from "@/components/ui/separator";
import { CreateProjectForm } from "@/modules/projects/components/";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { ArrowLeftIcon, BookOpenIcon, Building2Icon, UserIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export default async function ServerPage(props: PageProps<"/[slug]/project/new">) {
	const { slug } = await props.params;

	const { client } = await prefetchQuery(
		listOrganizationRepositories({ slugOrId: slug, page: 1, pageSize: 100 }),
	);

	return (
		<main>
			<section className="py-12">
				<div className="max-w-7xl w-full mx-auto px-8">
					<PageTitle>New Project</PageTitle>
					<div className="grid grid-cols-3 gap-8 mt-2">
						<div className="col-span-1">
							<PageDescription>
								Projects are used to group repositories and track their documentation. Create a new
								project to get started.
							</PageDescription>
							<Separator className="my-6" />
							<p className="text-sm text-zinc-700 flex justify-start items-center gap-2">
								<Building2Icon className="size-3.5 text-zinc-500" /> Random Corp. Inc
							</p>
							<p className="text-sm text-zinc-700 flex justify-start items-center gap-2 mt-2">
								<UserIcon className="size-3.5 text-zinc-500" /> chris23lngr
							</p>
							<div className="mt-12 space-y-2">
								<Link
									href={"#"}
									className="text-xs font-medium text-zinc-700 flex justify-start items-center gap-2"
								>
									<BookOpenIcon className="size-3.5 text-zinc-500" /> Learn more about projects
								</Link>
								<Link
									href={"#"}
									className="text-xs font-medium text-zinc-700 flex justify-start items-center gap-2"
								>
									<ArrowLeftIcon className="size-3.5 text-zinc-500" /> Back to projects
								</Link>
							</div>
						</div>
						<HydrationBoundary state={dehydrate(client)}>
							<Suspense fallback={<div>Loading...</div>}>
								<CreateProjectForm className="col-span-2" organizationSlug={slug} />
							</Suspense>
						</HydrationBoundary>
					</div>
				</div>
			</section>
		</main>
	);
}
