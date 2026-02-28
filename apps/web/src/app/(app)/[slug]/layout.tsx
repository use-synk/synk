import { FlashErrorToast } from "@/components/flash-error-toast";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { SiteNav } from "@/components/site-nav";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getErrorMessage } from "@/lib/api/api";
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

async function resolveActiveOrganization(slug: string) {
	return auth.api.setActiveOrganization({
		body: { organizationSlug: slug },
		headers: await headers(),
	});
}

export default async function ServerLayout(
	props: LayoutProps<"/[slug]">,
): Promise<React.ReactNode> {
	const { children, params, breadcrumb } = props;
	const { slug } = await params;

	let organization: Awaited<ReturnType<typeof resolveActiveOrganization>>;
	try {
		organization = await resolveActiveOrganization(slug);
	} catch (error) {
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

	if (!organization) {
		notFound();
	}

	return (
		<SidebarProvider>
			<Suspense fallback={null}>
				<FlashErrorToast />
			</Suspense>
			<AppSidebar activeOrganizationSlug={slug} />
			<div className="flex-1">
				<SiteNav breadcrumb={breadcrumb} />
				<main>{children}</main>
			</div>
		</SidebarProvider>
	);
}
