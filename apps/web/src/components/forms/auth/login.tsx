"use client";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { authClient } from "@/server/better-auth/client";
import { useState } from "react";
import { toast } from "sonner";

export function LoginForm({ className, ...props }: React.ComponentProps<"form">) {
	return (
		<form id="login-form" className={cn("w-full grid grid-cols-1 gap-2", className)} {...props}>
			<SocialProviderButton action={() => authClient.signIn.social({ provider: "github" })}>
				Sign in with GitHub
			</SocialProviderButton>
		</form>
	);
}

function SocialProviderButton({
	action,
	children,
	className,
	...props
}: React.ComponentProps<typeof Button> & { action: () => unknown | Promise<unknown> }) {
	const [isLoading, setIsLoading] = useState(false);

	return (
		<Button
			variant={"outline"}
			className={cn("w-full", className)}
			type="button"
			disabled={isLoading}
			onClick={async () => {
				try {
					setIsLoading(true);
					await action();
				} catch (error) {
					if (error instanceof Error) {
						toast.error(error.message);
					} else {
						toast.error("Failed to sign in");
					}
				} finally {
					setIsLoading(false);
				}
			}}
			{...props}
		>
			{isLoading ? <Spinner className="size-4" /> : <>{children}</>}
		</Button>
	);
}
