import "server-only";

import { cookies } from "next/headers";

const SESSION_COOKIE_NAMES = [
	"__Secure-better-auth.session_token",
	"better-auth.session_token",
] as const;

export const getServerAuthHeaders = async (): Promise<HeadersInit> => {
	const cookieStore = await cookies();
	for (const name of SESSION_COOKIE_NAMES) {
		const token = cookieStore.get(name)?.value;
		if (token !== undefined) {
			return { Authorization: `Bearer ${token}` };
		}
	}
	return {};
};
