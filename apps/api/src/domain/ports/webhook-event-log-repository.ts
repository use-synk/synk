import type { WebhookProvider } from "./webhook-repository.js";

export type CreateWebhookDeliveryInput = {
	provider: WebhookProvider;
	deliveryId: string;
	eventType: string;
	providerInstallationId?: string;
	providerRepositoryId?: string;
	signatureValid: boolean;
	payloadHash: string;
	receivedAt: Date;
};

export interface WebhookEventLogRepository {
	createDelivery(input: CreateWebhookDeliveryInput): Promise<void>;
	markProcessed(input: {
		provider: WebhookProvider;
		deliveryId: string;
		status: "processed" | "ignored" | "failed";
		error?: string;
	}): Promise<void>;
}
