"use client";

import { api } from "@/server/api";
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

	const { $fetch } = api("/integrations/github/install/init", "POST");

	const onClick = useCallback(async () => {
		setIsLoading(true);
		try {
			if (!organization?.id) {
				throw new Error("Organization not found");
			}

			const response = await $fetch({
				body: {
					organizationId: organization.id,
				},
			});

			router.push(response.data.redirectUrl);
		} catch (error) {
			toast.error("Failed to initiate GitHub installation", {
				description: error instanceof Error ? error.message : "Unknown error occurred",
			});
		} finally {
			setIsLoading(false);
		}
	}, [organization, $fetch, router]);

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
