import { SuggestionDetailSheet } from "@/components/suggestions/suggestion-detail-sheet";
import type { ReactNode } from "react";

export default function SuggestionDetailSheetLayout({ children }: { children: ReactNode }) {
	return <SuggestionDetailSheet>{children}</SuggestionDetailSheet>;
}
