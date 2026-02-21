export type InstallationOAuthStateRecord = {
	id: string;
	token: string;
	userId: string;
	organizationId: string;
	status: "pending" | "consumed" | "expired";
	expiresAt: Date;
	consumedAt: Date | null;
	createdAt: Date;
};

export type CreateInstallationOAuthStateInput = {
	token: string;
	userId: string;
	organizationId: string;
	expiresAt: Date;
};

export interface InstallationOAuthStateRepository {
	createState(input: CreateInstallationOAuthStateInput): Promise<void>;

	/**
	 * Atomically claims a state token.
	 * Returns the record if claim succeeds, null if already consumed, expired, or not found.
	 */
	claimState(token: string): Promise<InstallationOAuthStateRecord | null>;
}
