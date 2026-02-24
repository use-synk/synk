import z from "zod";

const uuidSchema = z.string().uuid();

/**
 * Returns true if the string has the shape of a valid UUID (e.g. RFC 4122).
 */
export function isUuid(value: string): boolean {
	return uuidSchema.safeParse(value).success;
}
