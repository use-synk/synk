import { headers } from "next/headers";

/**
 * Forward only auth-relevant inbound headers for server-side API calls.
 * Avoid forwarding transport headers (for example Host) across services.
 */
export async function getApiRequestHeaders(): Promise<Headers> {
	const incoming = await headers();
	const forwarded = new Headers();

	const cookie = incoming.get("cookie");
	if (cookie) {
		forwarded.set("cookie", cookie);
	}

	const authorization = incoming.get("authorization");
	if (authorization) {
		forwarded.set("authorization", authorization);
	}

	return forwarded;
}
