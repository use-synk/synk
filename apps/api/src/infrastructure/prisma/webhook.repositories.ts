import { db } from "@synk-ai/db";
import type {
	WebhookEventLogRepository,
	WebhookRepository,
} from "../../domain/ports/index.js";

const createPrismaWebhookRepository = (): WebhookRepository => ({
	findInstallation: async ({ provider, providerInstallationId }) =>
		db.providerInstallation.findUnique({
			where: {
				provider_providerInstallationId: {
					provider,
					providerInstallationId,
				},
			},
			select: { id: true, organizationId: true },
		}),
	upsertInstallation: async ({
		provider,
		providerInstallationId,
		organizationId,
		providerAccountId,
		accountLogin,
		accountType,
		status,
		deletedAt,
	}) =>
		db.providerInstallation.upsert({
			where: {
				provider_providerInstallationId: {
					provider,
					providerInstallationId,
				},
			},
			create: {
				organizationId,
				provider,
				providerInstallationId,
				providerAccountId,
				accountLogin,
				accountType,
				status,
				deletedAt,
			},
			update: {
				providerAccountId,
				accountLogin,
				accountType,
				status,
				deletedAt,
			},
			select: { id: true },
		}),
	markInstallationDeleted: async ({ provider, providerInstallationId }) => {
		await Promise.all([
			db.providerInstallation.updateMany({
				where: { provider, providerInstallationId },
				data: { status: "deleted", deletedAt: new Date() },
			}),
			db.providerRepository.updateMany({
				where: {
					installation: { provider, providerInstallationId },
				},
				data: { status: "removed", isActive: false },
			}),
		]);
	},
	findActiveRepository: async ({ provider, providerInstallationId, providerRepositoryId }) =>
		db.providerRepository.findFirst({
			where: {
				provider,
				providerRepositoryId,
				isActive: true,
				status: "active",
				installation: {
					provider,
					providerInstallationId,
					status: "active",
				},
			},
			select: { id: true, installationId: true, defaultBranch: true },
		}),
	upsertRepository: async ({
		installationId,
		provider,
		providerRepositoryId,
		ownerLogin,
		name,
		fullName,
		defaultBranch,
		status,
		isActive,
		lastSyncedAt,
	}) => {
		await db.providerRepository.upsert({
			where: {
				provider_providerRepositoryId: {
					provider,
					providerRepositoryId,
				},
			},
			create: {
				installationId,
				provider,
				providerRepositoryId,
				ownerLogin,
				name,
				fullName,
				defaultBranch,
				status,
				isActive,
				lastSyncedAt,
			},
			update: {
				installationId,
				ownerLogin,
				name,
				fullName,
				defaultBranch,
				status,
				isActive,
				lastSyncedAt,
			},
		});
	},
	markRepositoriesRemoved: async ({ provider, providerInstallationId, providerRepositoryIds }) => {
		if (providerRepositoryIds.length === 0) {
			return;
		}
		await db.providerRepository.updateMany({
			where: {
				installation: {
					provider,
					providerInstallationId,
				},
				providerRepositoryId: { in: [...providerRepositoryIds] },
			},
			data: { status: "removed", isActive: false },
		});
	},
});

const createPrismaWebhookEventLogRepository = (): WebhookEventLogRepository => ({
	createDelivery: async (_input) => {
		// TODO(step 10): wire delivery logging once delivery headers/hash are propagated.
	},
	markProcessed: async (_input) => {
		// TODO(step 10): wire delivery status updates once delivery IDs are persisted.
	},
});

export type WebhookRepositories = {
	webhookRepository: WebhookRepository;
	webhookEventLogRepository: WebhookEventLogRepository;
};

export const createPrismaWebhookRepositories = (): WebhookRepositories => ({
	webhookRepository: createPrismaWebhookRepository(),
	webhookEventLogRepository: createPrismaWebhookEventLogRepository(),
});
