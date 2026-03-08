import z from "zod";
import type { ApiQuery } from "../types";

const sessionUserSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	emailVerified: z.boolean(),
	image: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

const sessionSchema = z.object({
	id: z.string(),
	expiresAt: z.string(),
	token: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	ipAddress: z.string().nullable(),
	userAgent: z.string().nullable(),
	userId: z.string(),
	activeOrganizationId: z.string().nullable(),
});

export function getAuthSession() {
	return {
		url: "/auth/session",
		init: {
			method: "GET",
		},
		response: z.object({
			data: z
				.object({
					session: sessionSchema,
					user: sessionUserSchema,
				})
				.nullable(),
		}),
		key: ["auth", "session"],
	} satisfies ApiQuery;
}
