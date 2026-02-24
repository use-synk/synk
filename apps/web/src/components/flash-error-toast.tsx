"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

export const FLASH_MESSAGE_PARAM = "flash_message";

/**
 * Opaque keys mapped to display strings.
 * Add a new entry here whenever a new flash message is needed; never pass
 * raw user-visible text through the URL parameter, as that would allow
 * attacker-controlled URLs to display arbitrary toast messages (UI spoofing).
 */
const FLASH_MESSAGES: Record<string, string> = {
	github_install_error:
		"We could not complete the GitHub installation right now. Please try again.",
};

/**
 * Reads a `?flash_message=` query parameter on mount, maps it to a known
 * message string, displays an error toast, then removes the parameter from
 * the URL without a navigation.
 *
 * Unknown keys are silently ignored to prevent UI spoofing via crafted URLs.
 *
 * Must be rendered inside a <Suspense> boundary when used within a Server
 * Component layout, as required by Next.js for useSearchParams.
 */
export function FlashErrorToast() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		const key = searchParams.get(FLASH_MESSAGE_PARAM);
		if (!key) return;

		const message = FLASH_MESSAGES[key];
		if (message) {
			toast.error(message);
		}

		const next = new URLSearchParams(searchParams.toString());
		next.delete(FLASH_MESSAGE_PARAM);
		router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname);
	}, [searchParams, router, pathname]);

	return null;
}
