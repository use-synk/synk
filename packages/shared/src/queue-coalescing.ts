import {
	ANALYZE_CHANGES_COALESCE_WINDOW_MS,
	buildAnalyzeChangesActiveJobId,
	type AnalyzeChangesJobPayload,
} from "./queue";

export type PendingAnalyzeChangesPayload = {
	payload: AnalyzeChangesJobPayload;
	updatedAtMs: number;
};

export type QueueJobLike = {
	getState: () => Promise<string>;
	remove: () => Promise<void>;
};

export type RepositoryQueueLike = {
	getJob: (jobId: string) => Promise<QueueJobLike | null | undefined>;
};

export const isPendingPayloadRecord = (value: unknown): value is PendingAnalyzeChangesPayload => {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	if (typeof candidate.updatedAtMs !== "number") {
		return false;
	}

	const payload = candidate.payload;
	if (typeof payload !== "object" || payload === null) {
		return false;
	}

	const payloadRecord = payload as Record<string, unknown>;
	const trigger = payloadRecord.trigger as Record<string, unknown> | undefined;

	return (
		typeof payloadRecord.installationId === "string" &&
		typeof payloadRecord.repositoryId === "string" &&
		typeof trigger?.type === "string" &&
		typeof trigger.ref === "string" &&
		typeof trigger.commitSha === "string"
	);
};

export const parsePendingPayloadRecord = (
	rawValue: string | null,
): PendingAnalyzeChangesPayload | null => {
	if (rawValue === null) {
		return null;
	}

	try {
		const parsed = JSON.parse(rawValue);
		return isPendingPayloadRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

export const isAlreadyExistingJobError = (error: unknown): boolean => {
	if (!(error instanceof Error)) {
		return false;
	}
	return error.message.toLowerCase().includes("already exists");
};

export const isTerminalJobState = (state: string): boolean =>
	state === "completed" || state === "failed";

export const getRepositoryActiveJob = async (
	queue: RepositoryQueueLike,
	repositoryId: string,
): Promise<QueueJobLike | null> => {
	const activeJobId = buildAnalyzeChangesActiveJobId(repositoryId);
	const job = await queue.getJob(activeJobId);
	if (job == null) {
		return null;
	}

	const state = await job.getState();
	if (isTerminalJobState(state)) {
		await job.remove();
		return null;
	}

	return job;
};

export const calculateCoalesceDelayMs = (
	updatedAtMs: number,
	nowMs: number = Date.now(),
	windowMs: number = ANALYZE_CHANGES_COALESCE_WINDOW_MS,
): number => {
	const elapsedMs = Math.max(0, nowMs - updatedAtMs);
	return elapsedMs >= windowMs ? 0 : windowMs - elapsedMs;
};
