import type { Logger } from "./logger.js";

export type AppVariables = {
	requestId?: string;
	logger?: Logger;
};

export type AppEnv = {
	Variables: AppVariables;
};
