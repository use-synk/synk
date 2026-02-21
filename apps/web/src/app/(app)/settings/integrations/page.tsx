import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { ApiError } from "@/lib/api/client";
import { completeGitHubInstallation } from "@/lib/api/integrations";
import { getServerAuthHeaders } from "@/lib/api/server";
import { auth } from "@/server/better-auth";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

const callbackQuerySchema = z.object({
	installation_id: z.coerce.number().int().positive(),
	state: z.string().min(1),
	setup_action: z.enum(["install", "update"]),
});

function firstValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
}

function getErrorMessage(status: number): string {
	if (status === 400) {
		return "The GitHub callback parameters are invalid. Please try the installation again.";
	}
	if (status === 403) {
		return "You do not have access to complete this installation for the selected organization.";
	}
	if (status === 422) {
		return "The installation link has expired or was already used. Please start again from the integrations page.";
	}
	return "We could not complete the GitHub installation right now. Please try again.";
}

export default async function Page(
	props: PageProps<"/settings/integrations">,
): Promise<React.ReactNode> {
	const session = await auth.api.getSession({ headers: await headers() });
	if (!session) {
		redirect("/auth");
	}

	const searchParams = await props.searchParams;
	const callbackQuery = callbackQuerySchema.safeParse({
		installation_id: firstValue(searchParams.installation_id),
		state: firstValue(searchParams.state),
		setup_action: firstValue(searchParams.setup_action),
	});
	if (!callbackQuery.success) {
		redirect("/");
	}

	let organizationSlug: string;
	try {
		const result = await completeGitHubInstallation(
			{
				installationId: callbackQuery.data.installation_id,
				state: callbackQuery.data.state,
				setupAction: callbackQuery.data.setup_action,
			},
			{ headers: await getServerAuthHeaders() },
		);
		organizationSlug = result.data.organizationSlug;
	} catch (error) {
		const message =
			error instanceof ApiError
				? getErrorMessage(error.status)
				: "We could not complete the GitHub installation right now. Please try again.";

		return (
			<main className="flex min-h-svh flex-1 items-center justify-center p-8">
				<Empty>
					<EmptyHeader>
						<EmptyTitle>GitHub installation failed</EmptyTitle>
						<EmptyDescription>{message}</EmptyDescription>
						<pre>{JSON.stringify(error, null, 2)}</pre>
					</EmptyHeader>
					<Link href="/" className="text-primary hover:underline text-sm font-medium mt-4">
						Return home
					</Link>
				</Empty>
			</main>
		);
	}

	redirect(`/${organizationSlug}`);
}
