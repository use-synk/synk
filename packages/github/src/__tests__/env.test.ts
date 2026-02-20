import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	githubCredentialsEnvironmentSchema,
	githubEnvironmentSchema,
	parseGitHubCredentialsEnvironment,
	parseGitHubEnvironment,
} from "../env.js";

const VALID_CREDENTIALS_ENV = {
	GITHUB_APP_ID: "123456",
	GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----",
};

const VALID_FULL_ENV = {
	...VALID_CREDENTIALS_ENV,
	GITHUB_WEBHOOK_SECRET: "webhook-secret",
};

describe("githubCredentialsEnvironmentSchema", () => {
	it("accepts valid credential environment variables", () => {
		const result = githubCredentialsEnvironmentSchema.safeParse(VALID_CREDENTIALS_ENV);

		expect(result.success).toBe(true);
	});

	it("coerces GITHUB_APP_ID string to a number", () => {
		const result = githubCredentialsEnvironmentSchema.safeParse(VALID_CREDENTIALS_ENV);

		expect(result.success && result.data.GITHUB_APP_ID).toBe(123456);
	});

	it("succeeds without GITHUB_WEBHOOK_SECRET", () => {
		const result = githubCredentialsEnvironmentSchema.safeParse(VALID_CREDENTIALS_ENV);

		expect(result.success).toBe(true);
	});

	it("rejects a missing GITHUB_APP_ID", () => {
		const { GITHUB_APP_ID: _, ...rest } = VALID_CREDENTIALS_ENV;
		const result = githubCredentialsEnvironmentSchema.safeParse(rest);

		expect(result.success).toBe(false);
	});

	it("rejects a missing GITHUB_PRIVATE_KEY", () => {
		const { GITHUB_PRIVATE_KEY: _, ...rest } = VALID_CREDENTIALS_ENV;
		const result = githubCredentialsEnvironmentSchema.safeParse(rest);

		expect(result.success).toBe(false);
	});

	it("rejects an empty GITHUB_PRIVATE_KEY", () => {
		const result = githubCredentialsEnvironmentSchema.safeParse({
			...VALID_CREDENTIALS_ENV,
			GITHUB_PRIVATE_KEY: "",
		});

		expect(result.success).toBe(false);
	});
});

describe("githubEnvironmentSchema", () => {
	it("accepts all required environment variables", () => {
		const result = githubEnvironmentSchema.safeParse(VALID_FULL_ENV);

		expect(result.success).toBe(true);
	});

	it("rejects when GITHUB_WEBHOOK_SECRET is missing", () => {
		const result = githubEnvironmentSchema.safeParse(VALID_CREDENTIALS_ENV);

		expect(result.success).toBe(false);
	});

	it("rejects an empty GITHUB_WEBHOOK_SECRET", () => {
		const result = githubEnvironmentSchema.safeParse({
			...VALID_FULL_ENV,
			GITHUB_WEBHOOK_SECRET: "",
		});

		expect(result.success).toBe(false);
	});
});

describe("parseGitHubCredentialsEnvironment", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv, ...VALID_CREDENTIALS_ENV };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("parses credential env vars from process.env without requiring GITHUB_WEBHOOK_SECRET", () => {
		const env = parseGitHubCredentialsEnvironment();

		expect(env.GITHUB_APP_ID).toBe(123456);
		expect(env.GITHUB_PRIVATE_KEY).toBe(VALID_CREDENTIALS_ENV.GITHUB_PRIVATE_KEY);
	});

	it("throws when required credential env vars are missing", () => {
		process.env = { ...originalEnv };

		expect(() => parseGitHubCredentialsEnvironment()).toThrow();
	});
});

describe("parseGitHubEnvironment", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv, ...VALID_FULL_ENV };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("parses all required GitHub env vars from process.env", () => {
		const env = parseGitHubEnvironment();

		expect(env.GITHUB_APP_ID).toBe(123456);
		expect(env.GITHUB_PRIVATE_KEY).toBe(VALID_FULL_ENV.GITHUB_PRIVATE_KEY);
		expect(env.GITHUB_WEBHOOK_SECRET).toBe(VALID_FULL_ENV.GITHUB_WEBHOOK_SECRET);
	});

	it("throws when GITHUB_WEBHOOK_SECRET is missing", () => {
		process.env = { ...originalEnv, ...VALID_CREDENTIALS_ENV };

		expect(() => parseGitHubEnvironment()).toThrow();
	});
});
