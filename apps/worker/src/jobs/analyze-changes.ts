import type { AnalyzeChangesJobPayload } from "@synk-ai/shared";
import type { Job } from "bullmq";
import type { Logger } from "../logger.js";

export const processAnalyzeChangesJob = async (
	job: Job<AnalyzeChangesJobPayload>,
	logger: Logger,
): Promise<void> => {
	const attemptNumber = job.attemptsMade + 1;
	const jobLogger = logger.child({
		jobId: job.id ?? "unknown",
		attemptNumber,
		queue: job.queueName,
	});

	jobLogger.info({ payload: job.data }, "processing analyze changes job");
};
