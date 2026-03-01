import { db } from "@synk-ai/db";
import type { WebhookEventLogRepository, WebhookRepository } from "../../domain/ports/index";

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
	createDelivery: async (input) => {
		await db.webhookDelivery.upsert({
			where: {
				provider_deliveryId: {
					provider: input.provider,
					deliveryId: input.deliveryId,
				},
			},
			create: {
				provider: input.provider,
				deliveryId: input.deliveryId,
				eventType: input.eventType,
				...(input.providerInstallationId === undefined
					? {}
					: { providerInstallationId: input.providerInstallationId }),
				...(input.providerRepositoryId === undefined
					? {}
					: { providerRepositoryId: input.providerRepositoryId }),
				signatureValid: input.signatureValid,
				payloadHash: input.payloadHash,
				receivedAt: input.receivedAt,
				status: "received",
			},
			update: {
				eventType: input.eventType,
				...(input.providerInstallationId === undefined
					? {}
					: { providerInstallationId: input.providerInstallationId }),
				...(input.providerRepositoryId === undefined
					? {}
					: { providerRepositoryId: input.providerRepositoryId }),
				signatureValid: input.signatureValid,
				payloadHash: input.payloadHash,
				receivedAt: input.receivedAt,
				status: "received",
				processedAt: null,
				error: null,
			},
		});
	},
	markProcessed: async (input) => {
		await db.webhookDelivery.updateMany({
			where: {
				provider: input.provider,
				deliveryId: input.deliveryId,
			},
			data: {
				status: input.status,
				processedAt: new Date(),
				...(input.error === undefined ? { error: null } : { error: input.error }),
			},
		});
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
