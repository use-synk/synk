import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { githubEnvironmentSchema, parseGitHubEnvironment } from "../env.js";

const VALID_ENV = {
	GITHUB_APP_ID: "123456",
	GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----",
	GITHUB_WEBHOOK_SECRET: "webhook-secret",
};

describe("githubEnvironmentSchema", () => {
	it("accepts valid environment variables", () => {
		const result = githubEnvironmentSchema.safeParse(VALID_ENV);

		expect(result.success).toBe(true);
	});

	it("coerces GITHUB_APP_ID string to a number", () => {
		const result = githubEnvironmentSchema.safeParse(VALID_ENV);

		expect(result.success && result.data.GITHUB_APP_ID).toBe(123456);
	});

	it("rejects a missing GITHUB_APP_ID", () => {
		const { GITHUB_APP_ID: _, ...rest } = VALID_ENV;
		const result = githubEnvironmentSchema.safeParse(rest);

		expect(result.success).toBe(false);
	});

	it("rejects a missing GITHUB_PRIVATE_KEY", () => {
		const { GITHUB_PRIVATE_KEY: _, ...rest } = VALID_ENV;
		const result = githubEnvironmentSchema.safeParse(rest);

		expect(result.success).toBe(false);
	});

	it("rejects a missing GITHUB_WEBHOOK_SECRET", () => {
		const { GITHUB_WEBHOOK_SECRET: _, ...rest } = VALID_ENV;
		const result = githubEnvironmentSchema.safeParse(rest);

		expect(result.success).toBe(false);
	});

	it("rejects an empty GITHUB_PRIVATE_KEY", () => {
		const result = githubEnvironmentSchema.safeParse({ ...VALID_ENV, GITHUB_PRIVATE_KEY: "" });

		expect(result.success).toBe(false);
	});
});

describe("parseGitHubEnvironment", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv, ...VALID_ENV };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("parses required GitHub env vars from process.env", () => {
		const env = parseGitHubEnvironment();

		expect(env.GITHUB_APP_ID).toBe(123456);
		expect(env.GITHUB_PRIVATE_KEY).toBe(VALID_ENV.GITHUB_PRIVATE_KEY);
		expect(env.GITHUB_WEBHOOK_SECRET).toBe(VALID_ENV.GITHUB_WEBHOOK_SECRET);
	});

	it("throws when required env vars are missing", () => {
		process.env = { ...originalEnv };

		expect(() => parseGitHubEnvironment()).toThrow();
	});
});
