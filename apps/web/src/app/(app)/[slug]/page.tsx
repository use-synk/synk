import { getOrganizationSetupStatus, listUserOrganizations } from "@/api/endpoints";
import { RequestError } from "@/api/errors";
import { fetchQuery } from "@/api/server";
import { PageDescription, PageTitle } from "@/components/typography";
import { redirect } from "next/navigation";
import { OrganizationSetup } from "./_components/setup";

export default async function Page(props: PageProps<"/[slug]">): Promise<React.ReactNode> {
	const { slug } = await props.params;

	let organizations: Array<{ id: string; slug: string }>;
	try {
		const organizationsResult = await fetchQuery(listUserOrganizations());
		organizations = organizationsResult.data;
	} catch (error) {
		if (error instanceof RequestError && error.status === 401) {
			redirect("/auth");
		}
		throw error;
	}

	const organization = organizations.find((item) => item.slug === slug);
	if (!organization) {
		redirect("/auth");
	}

	const { data: setupStatus } = await fetchQuery(getOrganizationSetupStatus({ slugOrId: slug }));

	if (!setupStatus.hasInstallations || !setupStatus.hasRepositories || !setupStatus.hasProjects) {
		return (
			<OrganizationSetup
				setupStatus={setupStatus}
				organizationSlug={slug}
				organizationId={organization.id}
			/>
		);
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
