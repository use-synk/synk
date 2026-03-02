import { PageDescription, PageTitle } from "@/components/typography";
import { api } from "@/server/api";
import { getApiRequestHeaders } from "@/server/api/request-headers";
import { getQueryClient } from "@/server/api/tanstack-query/make-query-client";
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OrganizationSetup } from "./_components/setup";

export default async function Page(props: PageProps<"/[slug]">): Promise<React.ReactNode> {
	const { slug } = await props.params;
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		redirect("/auth");
	}

	const { options } = api("/organizations/:slugOrId/setup", "GET");
	const client = getQueryClient();
	const requestHeaders = await getApiRequestHeaders();

	const { data: setupStatus } = await client.fetchQuery(
		options({ params: { slugOrId: slug }, headers: requestHeaders }),
	);

	if (!setupStatus.hasInstallations || !setupStatus.hasRepositories || !setupStatus.hasProjects) {
		return <OrganizationSetup setupStatus={setupStatus} organizationSlug={slug} />;
	}

	return (
		<main className="pb-24">
			<section className="py-12 bg-linear-to-bl from-lime-50 to-background relative">
				<div className="absolute w-full h-24 bg-linear-to-b from-background/0 to-background left-0 bottom-0 z-10" />
				<div className="max-w-4xl w-full mx-auto px-14 relative z-20">
					<PageTitle>Welcome back!</PageTitle>
					<PageDescription className="mt-2">
						Here's what you need to do to get started.
					</PageDescription>
				</div>
			</section>
		</main>
	);
}
