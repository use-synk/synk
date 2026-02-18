import { beforeEach, describe, expect, it, vi } from "vitest";

const { MockOctokit, mockCreateAppAuth } = vi.hoisted(() => {
	const MockOctokit = vi.fn();
	const mockCreateAppAuth = vi.fn();
	return { MockOctokit, mockCreateAppAuth };
});

vi.mock("@octokit/rest", () => ({ Octokit: MockOctokit }));
vi.mock("@octokit/auth-app", () => ({ createAppAuth: mockCreateAppAuth }));

const { createAppOctokit, createInstallationOctokit, credentialsFromEnvironment } = await import(
	"../auth.js"
);

const TEST_CREDENTIALS = {
	appId: 123456,
	privateKey: "-----BEGIN RSA PRIVATE KEY-----\ntest-key-data\n-----END RSA PRIVATE KEY-----",
};

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
		const installationId = 987654;

		createInstallationOctokit(installationId, TEST_CREDENTIALS);

		expect(MockOctokit).toHaveBeenCalledOnce();
		expect(MockOctokit).toHaveBeenCalledWith({
			authStrategy: mockCreateAppAuth,
			auth: {
				appId: TEST_CREDENTIALS.appId,
				privateKey: TEST_CREDENTIALS.privateKey,
				installationId,
			},
		});
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

		const [firstCall, secondCall] = MockOctokit.mock.calls;

		expect(firstCall?.[0].auth.installationId).toBe(111);
		expect(secondCall?.[0].auth.installationId).toBe(222);
	});
});

describe("credentialsFromEnvironment", () => {
	it("maps environment variables to credentials", () => {
		const env = {
			GITHUB_APP_ID: 42,
			GITHUB_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----",
			GITHUB_WEBHOOK_SECRET: "secret",
		};

		const result = credentialsFromEnvironment(env);

		expect(result).toEqual({
			appId: 42,
			privateKey: "-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----",
		});
	});

	it("normalizes escaped newlines in the private key", () => {
		const env = {
			GITHUB_APP_ID: 42,
			GITHUB_PRIVATE_KEY:
				"-----BEGIN RSA PRIVATE KEY-----\\nescaped-key-data\\n-----END RSA PRIVATE KEY-----",
			GITHUB_WEBHOOK_SECRET: "secret",
		};

		const result = credentialsFromEnvironment(env);

		expect(result.privateKey).toBe(
			"-----BEGIN RSA PRIVATE KEY-----\nescaped-key-data\n-----END RSA PRIVATE KEY-----",
		);
	});

	it("does not modify keys that already contain real newlines", () => {
		const realNewlineKey =
			"-----BEGIN RSA PRIVATE KEY-----\nreal-key-data\n-----END RSA PRIVATE KEY-----";
		const env = {
			GITHUB_APP_ID: 42,
			GITHUB_PRIVATE_KEY: realNewlineKey,
			GITHUB_WEBHOOK_SECRET: "secret",
		};

		const result = credentialsFromEnvironment(env);

		expect(result.privateKey).toBe(realNewlineKey);
	});
});
