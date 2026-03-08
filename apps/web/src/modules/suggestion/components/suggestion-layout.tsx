import type { suggestionDetailSchema } from "@/api/endpoints";
import type z from "zod";
import { SuggestionHeader } from "./suggestion-header";

function SuggestionLayout({
	children,
	suggestion,
}: { children: React.ReactNode; suggestion: z.infer<typeof suggestionDetailSchema> }) {
	return (
		<>
			<SuggestionHeader suggestion={suggestion} />
			{children}
		</>
	);
}

export { SuggestionLayout };
