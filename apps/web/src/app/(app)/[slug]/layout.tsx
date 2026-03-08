import { listUserOrganizations } from "@/api/endpoints";
import { RequestError, getErrorMessage } from "@/api/errors";
import { fetchQuery } from "@/api/server";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export default async function ServerLayout(
	props: LayoutProps<"/[slug]">,
): Promise<React.ReactNode> {
	const { children, params } = props;
	const { slug } = await params;

	let organizations: Array<{ slug: string }>;
	try {
		const result = await fetchQuery(listUserOrganizations());
		organizations = result.data;
	} catch (error) {
		if (error instanceof RequestError && error.status === 401) {
			redirect("/auth");
		}

		return (
			<main className="flex min-h-svh flex-1 items-center justify-center p-8">
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Something went wrong</EmptyTitle>
						<EmptyDescription>{getErrorMessage(error)}</EmptyDescription>
					</EmptyHeader>
					<Link href="/" className="text-primary hover:underline text-sm font-medium mt-4">
						Return home
					</Link>
				</Empty>
			</main>
		);
	}

	if (!organizations.some((organization) => organization.slug === slug)) {
		notFound();
	}

	return children;

	// return (
	// 	<SidebarProvider>
	// 		<Suspense fallback={null}>
	// 			<FlashErrorToast />
	// 		</Suspense>
	// 		{/* <AppSidebar activeOrganizationSlug={slug} /> */}
	// 		<div className="flex-1">
	// 			{/* <SiteNav breadcrumb={breadcrumb} /> */}
	// 			<main>{children}</main>
	// 			{sheet}
	// 		</div>
	// 	</SidebarProvider>
	// );
}
