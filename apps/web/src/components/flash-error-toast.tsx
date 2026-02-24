"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

const FLASH_MESSAGE_PARAM = "flash_message";

/**
 * Reads a `?flash_message=` query parameter on mount, displays an error toast,
 * then removes the parameter from the URL without a navigation.
 *
 * Must be rendered inside a <Suspense> boundary when used within a Server
 * Component layout, as required by Next.js for useSearchParams.
 */
export function FlashErrorToast() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		const message = searchParams.get(FLASH_MESSAGE_PARAM);
		if (!message) return;

		toast.error(message);

		const next = new URLSearchParams(searchParams.toString());
		next.delete(FLASH_MESSAGE_PARAM);
		router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname);
	}, [searchParams, router, pathname]);

	return null;
}
