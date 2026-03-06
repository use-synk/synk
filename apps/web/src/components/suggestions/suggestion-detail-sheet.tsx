"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function SuggestionDetailSheet({ children }: { children: ReactNode }) {
	const router = useRouter();

	return (
		<Sheet
			open
			onOpenChange={(open) => {
				if (!open) {
					router.back();
				}
			}}
		>
			<SheetContent
				side="right"
				className="w-[min(100vw,980px)] data-[side=right]:sm:max-w-5xl p-0 gap-0"
				showCloseButton
			>
				<SheetHeader className="sr-only">
					<SheetTitle>Suggestion details</SheetTitle>
					<SheetDescription>Review the full suggestion diff and metadata.</SheetDescription>
				</SheetHeader>
				{children}
			</SheetContent>
		</Sheet>
	);
}
