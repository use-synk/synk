import type { Logger } from "./logger";

export type AppVariables = {
	requestId: string;
	logger: Logger;
};

export type AppEnv = {
	Variables: AppVariables;
};
