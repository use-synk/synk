import { PageTitle } from "@/components/typography";
import { api } from "@/server/api";
import { getQueryClient } from "@/server/api/tanstack-query/make-query-client";
import { auth } from "@/server/better-auth";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectsList } from "./projects-list";

export default async function ServerPage(props: PageProps<"/[slug]/projects">) {
	const { slug } = await props.params;

	const client = getQueryClient();

	const org = await auth.api.getFullOrganization({
		headers: await headers(),
		query: {
			organizationSlug: slug,
		},
	});

	if (!org) {
		notFound();
	}

	const { options } = api("/project/:organizationId", "GET");
	void (await client.prefetchQuery(
		options({
			params: { organizationId: org.id },
			query: { page: 1, pageSize: 12 },
			headers: await headers(),
		}),
	));

	return (
		<HydrationBoundary state={dehydrate(client)}>
			<main>
				<section className="py-12">
					<div className="max-w-7xl w-full mx-auto px-8">
						<PageTitle>Projects</PageTitle>
						<div>
							<Suspense fallback={<div>Loading...</div>}>
								<ProjectsList organizationId={org.id} />
							</Suspense>
						</div>
					</div>
				</section>
			</main>
		</HydrationBoundary>
	);
}
