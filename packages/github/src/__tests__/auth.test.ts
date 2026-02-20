import { beforeEach, describe, expect, it, mock } from "bun:test";

const MockOctokit = mock();
const mockCreateAppAuth = mock();

mock.module("@octokit/rest", () => ({ Octokit: MockOctokit }));
mock.module("@octokit/auth-app", () => ({ createAppAuth: mockCreateAppAuth }));

const { createAppOctokit, createInstallationOctokit, credentialsFromEnvironment } = await import(
	"../auth.js"
);

const TEST_CREDENTIALS = {
	appId: 123456,
	privateKey: "-----BEGIN RSA PRIVATE KEY-----\ntest-key-data\n-----END RSA PRIVATE KEY-----",
};

const ESCAPED_CREDENTIALS = {
	appId: 123456,
	privateKey: "-----BEGIN RSA PRIVATE KEY-----\\nescaped-key-data\\n-----END RSA PRIVATE KEY-----",
};

const NORMALIZED_KEY =
	"-----BEGIN RSA PRIVATE KEY-----\nescaped-key-data\n-----END RSA PRIVATE KEY-----";

describe("createAppOctokit", () => {
	beforeEach(() => {
		MockOctokit.mockClear();
	});

	it("creates an Octokit instance with the App auth strategy", () => {
		createAppOctokit(TEST_CREDENTIALS);

		expect(MockOctokit).toHaveBeenCalledOnce();
		expect(MockOctokit).toHaveBeenCalledWith({
			authStrategy: mockCreateAppAuth,
			auth: {
				appId: TEST_CREDENTIALS.appId,
				privateKey: TEST_CREDENTIALS.privateKey,
			},
		});
	});

	it("normalizes escaped newlines in the private key before passing to Octokit", () => {
		createAppOctokit(ESCAPED_CREDENTIALS);

		expect(MockOctokit).toHaveBeenCalledWith(
			expect.objectContaining({
				auth: expect.objectContaining({ privateKey: NORMALIZED_KEY }),
			}),
		);
	});

	it("returns the constructed Octokit instance", () => {
		const fakeInstance = {};
		MockOctokit.mockReturnValueOnce(fakeInstance);

		const result = createAppOctokit(TEST_CREDENTIALS);

		expect(result).toBe(fakeInstance);
	});
});

describe("createInstallationOctokit", () => {
	beforeEach(() => {
		MockOctokit.mockClear();
	});

	it("creates an Octokit instance with the installation auth strategy", () => {
		createInstallationOctokit(987654, TEST_CREDENTIALS);

		expect(MockOctokit).toHaveBeenCalledOnce();
		expect(MockOctokit).toHaveBeenCalledWith({
			authStrategy: mockCreateAppAuth,
			auth: {
				appId: TEST_CREDENTIALS.appId,
				privateKey: TEST_CREDENTIALS.privateKey,
				installationId: 987654,
			},
		});
	});

	it("normalizes escaped newlines in the private key before passing to Octokit", () => {
		createInstallationOctokit(1, ESCAPED_CREDENTIALS);

		expect(MockOctokit).toHaveBeenCalledWith(
			expect.objectContaining({
				auth: expect.objectContaining({ privateKey: NORMALIZED_KEY }),
			}),
		);
	});

	it("returns the constructed Octokit instance", () => {
		const fakeInstance = {};
		MockOctokit.mockReturnValueOnce(fakeInstance);

		const result = createInstallationOctokit(1, TEST_CREDENTIALS);

		expect(result).toBe(fakeInstance);
	});

	it("passes different installation IDs to independent instances", () => {
		createInstallationOctokit(111, TEST_CREDENTIALS);
		createInstallationOctokit(222, TEST_CREDENTIALS);

		expect(MockOctokit).toHaveBeenCalledTimes(2);
		expect(MockOctokit).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ auth: expect.objectContaining({ installationId: 111 }) }),
		);
		expect(MockOctokit).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ auth: expect.objectContaining({ installationId: 222 }) }),
		);
	});

	it("throws for installationId of zero", () => {
		expect(() => createInstallationOctokit(0, TEST_CREDENTIALS)).toThrow(
			"installationId must be a positive integer",
		);
	});

	it("throws for a negative installationId", () => {
		expect(() => createInstallationOctokit(-1, TEST_CREDENTIALS)).toThrow(
			"installationId must be a positive integer",
		);
	});

	it("throws for a non-integer installationId", () => {
		expect(() => createInstallationOctokit(Number.NaN, TEST_CREDENTIALS)).toThrow(
			"installationId must be a positive integer",
		);
	});
});

describe("credentialsFromEnvironment", () => {
	it("maps GITHUB_APP_ID and GITHUB_PRIVATE_KEY to credentials", () => {
		const env = {
			GITHUB_APP_ID: 42,
			GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----",
		};

		const result = credentialsFromEnvironment(env);

		expect(result).toEqual({
			appId: 42,
			privateKey: "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----",
		});
	});

	it("is compatible with the superset GitHubEnvironment type", () => {
		const fullEnv = {
			GITHUB_APP_ID: 99,
			GITHUB_PRIVATE_KEY: "key",
			GITHUB_WEBHOOK_SECRET: "secret",
		};

		const result = credentialsFromEnvironment(fullEnv);

		expect(result.appId).toBe(99);
	});
});
