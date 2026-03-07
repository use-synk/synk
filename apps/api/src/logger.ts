import pino from "pino";

export type Logger = pino.Logger;

export const createLogger = (level: pino.LevelWithSilent, isDevelopment: boolean): Logger => {
	const options: pino.LoggerOptions = {
		level,
		timestamp: pino.stdTimeFunctions.isoTime,
		base: {
			service: "api",
			runtime: "bun",
			nodeEnv: process.env.NODE_ENV ?? "unknown",
		},
		redact: {
			paths: [
				"req.headers.authorization",
				"req.headers.cookie",
				"request.headers.authorization",
				"request.headers.cookie",
				"headers.authorization",
				"headers.cookie",
				"token",
				"accessToken",
				"refreshToken",
				"password",
			],
		},
	};
	const logtailSourceToken = process.env.LOGTAIL_SOURCE_TOKEN;
	const logtailEndpoint = process.env.LOGTAIL_ENDPOINT;
	const transportTargets: Array<{ target: string; options?: Record<string, unknown> }> = [];

	if (isDevelopment) {
		transportTargets.push({
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "HH:MM:ss Z",
				ignore: "pid,hostname",
				singleLine: true,
			},
		});
	}

	if (logtailSourceToken) {
		transportTargets.push({
			target: "@logtail/pino",
			options: {
				sourceToken: logtailSourceToken,
				options: logtailEndpoint ? { endpoint: logtailEndpoint } : undefined,
			},
		});
	}

	if (transportTargets.length === 1) {
		options.transport = transportTargets[0];
	} else if (transportTargets.length > 1) {
		options.transport = { targets: transportTargets };
	}

	return pino(options);
};
