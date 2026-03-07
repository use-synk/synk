import pino from "pino";

export type Logger = pino.Logger;

export const createLogger = (level: pino.LevelWithSilent, isDevelopment: boolean): Logger => {
	const options: pino.LoggerOptions = { level };

	if (isDevelopment) {
		options.transport = {
			target: "pino-pretty",
			options: { colorize: true, translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
		};
	}

	options.transport = {
		target: "@logtail/pino",
		options: {
			sourceToken: process.env.LOGTAIL_SOURCE_TOKEN,
			options: { endpoint: process.env.LOGTAIL_ENDPOINT },
		},
	};

	return pino(options);
};
