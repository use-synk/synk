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
	const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
		credentials: "include",
		...init,
		headers: {
			"Content-Type": "application/json",
			...init?.headers,
		},
	});

	if (!response.ok) {
		const message = await response.text().catch(() => response.statusText);
		throw new ApiError(response.status, message);
	}

	return response.json();
};
