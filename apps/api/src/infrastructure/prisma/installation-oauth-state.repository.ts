import { db } from "@synk-ai/db";
import type {
	CreateInstallationOAuthStateInput,
	InstallationOAuthStateRecord,
	InstallationOAuthStateRepository,
} from "../../domain/ports";

type PrismaInstallationOAuthStateClient = Pick<typeof db, "installationOAuthState">;

export const createPrismaInstallationOAuthStateRepository = (
	client: PrismaInstallationOAuthStateClient = db,
): InstallationOAuthStateRepository => ({
	createState: async (input: CreateInstallationOAuthStateInput): Promise<void> => {
		await client.installationOAuthState.create({
			data: {
				token: input.token,
				userId: input.userId,
				organizationId: input.organizationId,
				expiresAt: input.expiresAt,
			},
		});
	},

	claimState: async (token: string): Promise<InstallationOAuthStateRecord | null> => {
		const now = new Date();

		// Atomically transition the token from pending → consumed.
		// updateMany returns the count of affected rows; exactly 1 means we won the claim.
		// Concurrent callers hitting the same token will see count === 0 and return null.
		const { count } = await client.installationOAuthState.updateMany({
			where: {
				token,
				status: "pending",
				expiresAt: { gt: now },
			},
			data: {
				status: "consumed",
				consumedAt: now,
			},
		});

		if (count === 0) {
			return null;
		}

		const record = await client.installationOAuthState.findUnique({
			where: { token },
		});

		if (record === null) {
			// Should never happen — we just updated this row — but guard defensively.
			return null;
		}

		return {
			id: record.id,
			token: record.token,
			userId: record.userId,
			organizationId: record.organizationId,
			status: record.status as InstallationOAuthStateRecord["status"],
			expiresAt: record.expiresAt,
			consumedAt: record.consumedAt,
			createdAt: record.createdAt,
		};
	},
});
