import type { suggestionDetailSchema } from "@/api/endpoints";
import type z from "zod";

function translateSuggestionStatus(status: z.infer<typeof suggestionDetailSchema>["status"]) {
	switch (status) {
		case "pending":
			return "Pending";
		case "accepted":
			return "Accepted";
		case "declined":
			return "Declined";
		case "superseded":
			return "Superseded";
		case "stale":
			return "Stale";
		case "applied":
			return "Applied";
		default:
			return "Unknown";
	}
}

export { translateSuggestionStatus };
