"use client";

import { clientFetch } from "@/api/client";
import { getErrorMessage } from "@/api/errors";
import { initiateGithubInstallation } from "@/api/endpoints";
import { authClient } from "@/server/better-auth/client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function InstallGitHubButton({
	children,
	disabled,
	...props
}: Omit<React.ComponentProps<typeof Button>, "onClick">) {
	const { data: organization, isPending } = authClient.useActiveOrganization();
	const [isLoading, setIsLoading] = useState(false);
	const router = useRouter();

	const onClick = useCallback(async () => {
		setIsLoading(true);
		try {
			if (!organization?.id || !organization.slug) {
				throw new Error("Organization not found");
			}

			const query = initiateGithubInstallation({ organizationId: organization.id });
			const { data } = await clientFetch(query.url, query.init, query.response);

			// Persist the org slug in a short-lived cookie so the server-side
			// callback page can redirect back here if an error occurs.
			document.cookie = `pending_install_slug=${encodeURIComponent(organization.slug)}; path=/; max-age=900; SameSite=Lax`;

			router.push(data.data.redirectUrl);
		} catch (error) {
			toast.error("Failed to initiate GitHub installation", {
				description: getErrorMessage(error),
			});
		} finally {
			setIsLoading(false);
		}
	}, [organization, router]);

	return (
		<Button
			onClick={onClick}
			disabled={isPending || !organization || disabled || isLoading}
			{...props}
		>
			{children}
		</Button>
	);
}
