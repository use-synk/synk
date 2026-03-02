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

function extractAuthErrorMessage(result: unknown): string | null {
	if (!result || typeof result !== "object") {
		return null;
	}

	const response = result as Record<string, unknown>;
	const error = response.error;
	if (!error || typeof error !== "object") {
		return null;
	}

	const authError = error as Record<string, unknown>;
	if (typeof authError.message === "string" && authError.message.length > 0) {
		return authError.message;
	}

	if (typeof authError.code === "string" && authError.code.length > 0) {
		return `Sign in failed (${authError.code})`;
	}

	return "Failed to sign in";
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
					const result = await action();
					const errorMessage = extractAuthErrorMessage(result);
					if (errorMessage) {
						toast.error(errorMessage);
					}
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
