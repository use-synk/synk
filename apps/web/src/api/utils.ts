import { env } from "@/env";

export function buildFetchUrl(url: string): URL | string {
	if (url.startsWith("http://") || url.startsWith("https://")) {
		return url;
	}

	return new URL(url, env.NEXT_PUBLIC_API_URL);
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
