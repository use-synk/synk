import type { AiLogFields, AiLogger } from "../logging.js";

export type LogEvent = {
	message: string;
	fields: AiLogFields;
};

export const createLoggerCollector = (): { logger: AiLogger; entries: LogEvent[] } => {
	const entries: LogEvent[] = [];
	return {
		entries,
		logger: {
			info: (message: string, fields: AiLogFields): void => {
				entries.push({ message, fields });
			},
			warn: (message: string, fields: AiLogFields): void => {
				entries.push({ message, fields });
			},
			error: (message: string, fields: AiLogFields): void => {
				entries.push({ message, fields });
			},
		},
	};
};
