import { z } from "zod";

export const triggerTypeValues = ["push", "merge", "manual"] as const;
export const runStatusValues = [
	"queued",
	"running",
	"completed",
	"skipped",
	"failed",
	"canceled",
] as const;
// These values must stay in sync with the VcsProvider enum in packages/db/src/schemas/app.prisma.
// This package intentionally does not depend on @synk-ai/db, so the duplication is by design.
export const vcsProviderValues = ["github", "gitlab", "bitbucket"] as const;

export const triggerTypeSchema = z.enum(triggerTypeValues);
export const runStatusSchema = z.enum(runStatusValues);
export const vcsProviderSchema = z.enum(vcsProviderValues);

export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type VcsProvider = z.infer<typeof vcsProviderSchema>;
