import { z } from "zod";

const repositoryPayloadSchema = z.object({
	id: z.number().int().optional(),
	name: z.string().optional(),
	full_name: z.string().optional(),
	default_branch: z.string().optional(),
	owner: z.object({ login: z.string().optional() }).optional(),
});

export const installationEventSchema = z.object({
	action: z.string().optional(),
	installation: z
		.object({
			id: z.number().int().optional(),
			account: z
				.object({
					id: z.number().int().optional(),
					login: z.string().optional(),
					type: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
});

export const installationRepositoriesEventSchema = z.object({
	action: z.string().optional(),
	installation: z.object({ id: z.number().int().optional() }).optional(),
	repositories_added: z.array(repositoryPayloadSchema).optional(),
	repositories_removed: z.array(repositoryPayloadSchema).optional(),
});

export const pushEventSchema = z.object({
	ref: z.string().optional(),
	after: z.string().optional(),
	installation: z.object({ id: z.number().int().optional() }).optional(),
	repository: z.object({ id: z.number().int().optional() }).optional(),
});

export const pullRequestEventSchema = z.object({
	action: z.string().optional(),
	number: z.number().int().optional(),
	installation: z.object({ id: z.number().int().optional() }).optional(),
	repository: z.object({ id: z.number().int().optional() }).optional(),
	pull_request: z
		.object({
			merged: z.boolean().optional(),
			merge_commit_sha: z.string().nullable().optional(),
			base: z.object({ ref: z.string().optional() }).optional(),
			head: z.object({ sha: z.string().optional() }).optional(),
		})
		.optional(),
});

export type InstallationEventPayload = z.infer<typeof installationEventSchema>;
export type InstallationRepositoriesEventPayload = z.infer<
	typeof installationRepositoriesEventSchema
>;
export type PushEventPayload = z.infer<typeof pushEventSchema>;
export type PullRequestEventPayload = z.infer<typeof pullRequestEventSchema>;
export type RepositoryPayload = z.infer<typeof repositoryPayloadSchema>;
