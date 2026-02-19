"use client";

import { authClient } from "@/server/better-auth/client";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

export function SignOut() {
	const router = useRouter();

	return (
		<Button
			variant={"destructive"}
			onClick={async () => {
				await authClient.signOut();
				router.push("/auth");
			}}
		>
			Sign out
		</Button>
	);
}
