import { env } from "@/env";

export class ApiError extends Error {
	public readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

export const apiFetch = async (path: string, init?: RequestInit): Promise<unknown> => {
	const normalizedHeaders = new Headers(init?.headers);
	if (!normalizedHeaders.has("Content-Type")) {
		normalizedHeaders.set("Content-Type", "application/json");
	}

	const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
		credentials: "include",
		...init,
		headers: normalizedHeaders,
	});

	if (!response.ok) {
		const message = await response.text().catch(() => response.statusText);
		throw new ApiError(response.status, message);
	}

	// Successful responses like 204/205 or empty bodies should not be parsed as JSON.
	const responseText = await response.text();
	if (responseText.length === 0) {
		return null;
	}

	return JSON.parse(responseText);
};
