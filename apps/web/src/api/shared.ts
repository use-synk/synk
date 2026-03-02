import { env } from "@/env";
import z from "zod";

export function buildFetchUrl(url: string): URL | string {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url;
	}

	let normalizedUrl = url;
	if (url.startsWith("/")) {
		normalizedUrl = normalizedUrl.slice(1);
	}

	const apiBaseUrl = env.NEXT_PUBLIC_API_URL.endsWith("/")
		? env.NEXT_PUBLIC_API_URL
		: `${env.NEXT_PUBLIC_API_URL}/`;

	return new URL(normalizedUrl, apiBaseUrl);
}

export const parseResponseBody = async (res: Response): Promise<unknown> => {
	const text = await res.text();
	if (text.length === 0) return null;
	try {
		return JSON.parse(text);
	} catch {
		const contentType = res.headers.get("Content-Type") ?? "unknown";
		throw new Error(
			`Response is not valid JSON (Content-Type: ${contentType}): ${text.slice(0, 200)}`,
		);
	}
};

export const paginationResultSchema = z.object({
	page: z.number().int(),
	pageSize: z.number().int(),
	total: z.number().int(),
	totalPages: z.number().int(),
});
