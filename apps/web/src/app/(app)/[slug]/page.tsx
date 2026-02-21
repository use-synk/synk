import { InstallIntegration } from "@/components/install-integration";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { fetchInstallationRepositories, repositoryKeys } from "@/lib/api/repositories";
import { getServerAuthHeaders } from "@/lib/api/server";
import { createQueryClient } from "@/lib/query-client";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { RepositoryList } from "./_components/repository-list";

async function resolveInstallationId(slug: string): Promise<string | null> {
	const installation = await db.providerInstallation.findFirst({
		where: {
			organization: { slug },
			status: "active",
		},
		select: { id: true },
	});
	return installation?.id ?? null;
}

export default async function Page(props: PageProps<"/[slug]">): Promise<React.ReactNode> {
	const { slug } = await props.params;

	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		redirect("/auth");
	}

	const installationId = await resolveInstallationId(slug);

	if (installationId === null) {
		return (
			<div className="p-8 flex flex-1 items-center justify-center">
				<Empty>
					<EmptyHeader>
						<EmptyTitle>No GitHub App installed</EmptyTitle>
						<EmptyDescription>
							Install the Synk GitHub App to start syncing your repositories.
						</EmptyDescription>
						<InstallIntegration />
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	const queryClient = createQueryClient();
	const authHeaders = await getServerAuthHeaders();

	await queryClient.prefetchQuery({
		queryKey: repositoryKeys.list(installationId),
		queryFn: () =>
			fetchInstallationRepositories(installationId, undefined, { headers: authHeaders }),
	});

	return (
		<div className="p-8">
			<h1 className="text-xl font-semibold mb-6">Repositories</h1>
			<HydrationBoundary state={dehydrate(queryClient)}>
				<RepositoryList installationId={installationId} />
			</HydrationBoundary>
		</div>
	);
}
