import "server-only";

import { headers } from "next/headers";

export const getServerAuthHeaders = async (): Promise<HeadersInit> => {
	const reqHeaders = await headers();
	const cookie = reqHeaders.get("cookie");
	return cookie ? { Cookie: cookie } : {};
};
