import pino from "pino";

export type Logger = pino.Logger;

export const createLogger = (level: string, isDevelopment: boolean): Logger => {
	const options: pino.LoggerOptions = { level };

	if (isDevelopment) {
		options.transport = {
			target: "pino-pretty",
			options: { colorize: true, translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
		};
	}

	return pino(options);
};
