import { HTTPException } from "hono/http-exception";
import z from "zod";
import type { OrganizationRepository } from "./ports";

const uuidSchema = z.string().uuid();

/**
 * Returns true if the string has the shape of a valid UUID (e.g. RFC 4122).
 */
export function isUuid(value: string): boolean {
	return uuidSchema.safeParse(value).success;
}

/**
 * Resolves a slug-or-ID string to an organization ID.
 * If the value is already a UUID it is returned as-is; otherwise the
 * organization is looked up by slug and its ID is returned.
 *
 * @throws {HTTPException} 404 when the slug does not match any organization.
 */
export async function resolveOrganizationId(
	slugOrId: string,
	organizationRepository: Pick<OrganizationRepository, "findOrganizationBySlug">,
): Promise<string> {
	if (isUuid(slugOrId)) {
		return slugOrId;
	}

	const org = await organizationRepository.findOrganizationBySlug(slugOrId);

	if (!org) {
		throw new HTTPException(404, { message: "Organization not found" });
	}

	return org.id;
}
