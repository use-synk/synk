export type AiLogFields = Record<string, unknown>;

export interface AiLogger {
	info: (message: string, fields: AiLogFields) => void;
	warn: (message: string, fields: AiLogFields) => void;
	error: (message: string, fields: AiLogFields) => void;
}

const noop = (): void => {
	// no-op by design
};

export const noopAiLogger: AiLogger = {
	info: noop,
	warn: noop,
	error: noop,
};
