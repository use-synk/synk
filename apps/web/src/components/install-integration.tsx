"use client";

import { initiateGitHubInstallation } from "@/lib/api/integrations";
import { authClient } from "@/server/better-auth/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function InstallIntegration() {
	const [loading, setLoading] = useState(false);

	const { data, isPending: isPendingActiveOrganization } = authClient.useActiveOrganization();
	const router = useRouter();

	const onClick = async () => {
		setLoading(true);
		if (!data) {
			setLoading(false);
			return;
		}

		try {
			const response = await initiateGitHubInstallation({ organizationId: data.id });

			if (!response.data) {
				toast.error("Failed to initiate GitHub installation");
				setLoading(false);
				return;
			}

			router.push(response.data.redirectUrl);
			setLoading(false);
		} catch (error) {
			if (error instanceof Error) {
				toast.error(error.message);
			} else {
				toast.error("Failed to initiate GitHub installation");
			}

			setLoading(false);
			return;
		}
	};

	return (
		<Button disabled={isPendingActiveOrganization || loading} onClick={onClick}>
			Install Integration
		</Button>
	);
}
