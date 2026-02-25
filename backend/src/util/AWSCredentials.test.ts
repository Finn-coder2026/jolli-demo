import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AWSCredentials", () => {
	const originalEnv = process.env;
	let mockSend: ReturnType<typeof vi.fn>;
	let STSClientMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.resetModules();

		// Create fresh mocks for each test
		mockSend = vi.fn();
		STSClientMock = vi.fn().mockImplementation(() => ({
			send: mockSend,
		}));

		// Mock the STS client
		vi.doMock("@aws-sdk/client-sts", () => ({
			STSClient: STSClientMock,
			AssumeRoleWithWebIdentityCommand: vi.fn().mockImplementation(input => ({ input })),
		}));
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("getOIDCToken", () => {
		it("delegates to the OIDC token provider", async () => {
			// Mock the OIDCTokenProvider module
			vi.doMock("./OIDCTokenProvider", () => ({
				getOIDCTokenProvider: () => ({
					getToken: () => "provider-token",
				}),
			}));

			const { getOIDCToken } = await import("./AWSCredentials");
			expect(getOIDCToken()).toBe("provider-token");
		});
	});

	describe("createAWSCredentialsProvider", () => {
		it("returns undefined when useOIDC is false", async () => {
			const { createAWSCredentialsProvider } = await import("./AWSCredentials");
			const result = createAWSCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				useOIDC: false,
			});
			expect(result).toBeUndefined();
		});

		it("returns undefined when useOIDC is true but no roleArn", async () => {
			const { createAWSCredentialsProvider } = await import("./AWSCredentials");
			const result = createAWSCredentialsProvider({
				useOIDC: true,
			});
			expect(result).toBeUndefined();
		});

		it("returns undefined when roleArn provided but useOIDC is not set", async () => {
			const { createAWSCredentialsProvider } = await import("./AWSCredentials");
			const result = createAWSCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
			});
			expect(result).toBeUndefined();
		});

		it("returns credentials provider when useOIDC is true with roleArn", async () => {
			const { createAWSCredentialsProvider } = await import("./AWSCredentials");
			const result = createAWSCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				useOIDC: true,
				region: "us-west-2",
			});
			expect(result).toBeDefined();
			expect(typeof result).toBe("function");
		});
	});

	describe("createOIDCCredentialsProvider", () => {
		it("throws when token is not available", async () => {
			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			// biome-ignore lint/nursery/noUselessUndefined: Required for explicit return type match
			const noTokenGetter = (): string | undefined => undefined;
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: noTokenGetter,
			});
			await expect(provider()).rejects.toThrow("OIDC token not available");
		});

		it("calls STS with correct parameters", async () => {
			mockSend.mockResolvedValue({
				Credentials: {
					AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
					SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					SessionToken: "session-token",
					Expiration: new Date(Date.now() + 3600000),
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				region: "us-west-2",
				sessionName: "test-session",
				getToken: () => "oidc-token-xyz",
			});

			await provider();

			expect(STSClientMock).toHaveBeenCalledWith({ region: "us-west-2" });
			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					input: {
						RoleArn: "arn:aws:iam::123456789012:role/TestRole",
						RoleSessionName: "test-session",
						WebIdentityToken: "oidc-token-xyz",
					},
				}),
			);
		});

		it("uses AWS_REGION env var when region not provided", async () => {
			process.env.AWS_REGION = "eu-west-1";
			mockSend.mockResolvedValue({
				Credentials: {
					AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
					SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					SessionToken: "session-token",
					Expiration: new Date(Date.now() + 3600000),
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			await provider();

			expect(STSClientMock).toHaveBeenCalledWith({ region: "eu-west-1" });
		});

		it("uses default session name when not provided", async () => {
			mockSend.mockResolvedValue({
				Credentials: {
					AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
					SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					SessionToken: "session-token",
					Expiration: new Date(Date.now() + 3600000),
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			await provider();

			expect(mockSend).toHaveBeenCalledWith(
				expect.objectContaining({
					input: expect.objectContaining({
						RoleSessionName: "jolli-session",
					}),
				}),
			);
		});

		it("returns credentials in correct format", async () => {
			const expiration = new Date(Date.now() + 3600000);
			mockSend.mockResolvedValue({
				Credentials: {
					AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
					SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					SessionToken: "session-token-abc",
					Expiration: expiration,
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			const creds = await provider();

			expect(creds).toEqual({
				accessKeyId: "AKIAIOSFODNN7EXAMPLE",
				secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
				sessionToken: "session-token-abc",
				expiration,
			});
		});

		it("throws when STS returns no credentials", async () => {
			mockSend.mockResolvedValue({});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			await expect(provider()).rejects.toThrow("STS AssumeRoleWithWebIdentity returned no credentials");
		});

		it("throws when STS returns incomplete credentials", async () => {
			mockSend.mockResolvedValue({
				Credentials: {
					// Missing AccessKeyId
					SecretAccessKey: "secret",
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			await expect(provider()).rejects.toThrow("STS response missing required credential fields");
		});

		it("caches credentials until near expiry", async () => {
			const expiration = new Date(Date.now() + 3600000); // 1 hour from now
			mockSend.mockResolvedValue({
				Credentials: {
					AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
					SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					SessionToken: "session-token",
					Expiration: expiration,
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			// First call should make STS request
			await provider();
			expect(mockSend).toHaveBeenCalledTimes(1);

			// Second call should use cache
			await provider();
			expect(mockSend).toHaveBeenCalledTimes(1);

			// Third call should still use cache
			await provider();
			expect(mockSend).toHaveBeenCalledTimes(1);
		});

		it("refreshes credentials when near expiry", async () => {
			// Set expiration to 4 minutes from now (less than 5 min buffer)
			const nearExpiration = new Date(Date.now() + 240000);
			mockSend.mockResolvedValue({
				Credentials: {
					AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
					SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					SessionToken: "session-token",
					Expiration: nearExpiration,
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			// First call
			await provider();
			expect(mockSend).toHaveBeenCalledTimes(1);

			// Second call should refresh since expiration is within buffer
			await provider();
			expect(mockSend).toHaveBeenCalledTimes(2);
		});

		it("handles credentials without expiration time", async () => {
			mockSend.mockResolvedValue({
				Credentials: {
					AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
					SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
					SessionToken: "session-token",
					// No Expiration field
				},
			});

			const { createOIDCCredentialsProvider } = await import("./AWSCredentials");
			const provider = createOIDCCredentialsProvider({
				roleArn: "arn:aws:iam::123456789012:role/TestRole",
				getToken: () => "token",
			});

			const creds = await provider();

			expect(creds.expiration).toBeUndefined();
			expect(creds.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");
		});
	});
});
