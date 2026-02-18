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

export const triggerTypeSchema = z.enum(triggerTypeValues);
export const runStatusSchema = z.enum(runStatusValues);

export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
