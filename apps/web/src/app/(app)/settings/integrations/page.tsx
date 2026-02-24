import { FLASH_MESSAGE_PARAM } from "@/components/flash-error-toast";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { getErrorMessage } from "@/lib/api/api";
import { api } from "@/server/api";
import { auth } from "@/server/better-auth";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

const callbackQuerySchema = z.object({
	installation_id: z.coerce.number().int().positive(),
	state: z.string().min(1),
	setup_action: z.enum(["install", "update"]),
});

const PENDING_INSTALL_SLUG_COOKIE = "pending_install_slug";
const SLUG_RE = /^[a-z0-9-]+$/;

function firstValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}
	return value;
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

	const cookieStore = await cookies();
	const pendingSlug = cookieStore.get(PENDING_INSTALL_SLUG_COOKIE)?.value;

	let organizationSlug: string;
	try {
		const { $fetch } = api("/integrations/github/install/callback", "GET");
		const response = await $fetch({
			query: {
				installation_id: callbackQuery.data.installation_id,
				state: callbackQuery.data.state,
				setup_action: callbackQuery.data.setup_action,
			},
		});

		organizationSlug = response.data.organizationSlug;
	} catch (error) {
		if (pendingSlug && SLUG_RE.test(pendingSlug)) {
			redirect(`/${pendingSlug}?${FLASH_MESSAGE_PARAM}=github_install_error`);
		}

		return (
			<main className="flex min-h-svh flex-1 items-center justify-center p-8">
				<Empty>
					<EmptyHeader>
						<EmptyTitle>GitHub installation failed</EmptyTitle>
						<EmptyDescription>
							{getErrorMessage(
								error,
								"We could not complete the GitHub installation right now. Please try again.",
							)}
						</EmptyDescription>
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
