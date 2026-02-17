import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { authSchema } from "./schema.js";

type BetterAuthOptions = Parameters<typeof betterAuth>[0];
type DrizzleDatabase = Parameters<typeof drizzleAdapter>[0];
type DrizzleAdapterOptions = NonNullable<Parameters<typeof drizzleAdapter>[1]>;

export interface CreateAuthOptions {
	readonly db: DrizzleDatabase;
	readonly secret: string;
	readonly baseURL: string;
	readonly trustedOrigins?: BetterAuthOptions["trustedOrigins"];
	readonly emailAndPassword?: BetterAuthOptions["emailAndPassword"];
	readonly socialProviders?: BetterAuthOptions["socialProviders"];
	readonly plugins?: BetterAuthOptions["plugins"];
	readonly drizzle?: Omit<DrizzleAdapterOptions, "schema">;
}

const assertRequiredValue = (value: string, key: string): void => {
	if (value.trim().length === 0) {
		throw new Error(`${key} must not be empty.`);
	}
};

export const createAuth = (options: CreateAuthOptions): ReturnType<typeof betterAuth> => {
	assertRequiredValue(options.secret, "secret");
	assertRequiredValue(options.baseURL, "baseURL");

	const database = drizzleAdapter(options.db, {
		provider: "pg",
		...options.drizzle,
		schema: authSchema,
	});

	return betterAuth({
		secret: options.secret,
		baseURL: options.baseURL,
		trustedOrigins: options.trustedOrigins,
		database,
		emailAndPassword: options.emailAndPassword ?? { enabled: true },
		socialProviders: options.socialProviders,
		plugins: options.plugins,
	});
};
