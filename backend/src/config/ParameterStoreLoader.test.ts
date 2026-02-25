import { ParameterStoreLoader } from "./ParameterStoreLoader";
import { SSMClient } from "@aws-sdk/client-ssm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AWS SDK
vi.mock("@aws-sdk/client-ssm", () => {
	const mockSend = vi.fn();
	return {
		SSMClient: vi.fn(() => ({
			send: mockSend,
		})),
		GetParametersByPathCommand: vi.fn(params => params),
	};
});

describe("ParameterStoreLoader", () => {
	let mockSend: ReturnType<typeof vi.fn>;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		vi.clearAllMocks();
		// Store original env
		originalEnv = { ...process.env };
		// Get the mock send function
		const SSMClientConstructor = SSMClient as unknown as ReturnType<typeof vi.fn>;
		const mockInstance = new SSMClientConstructor();
		mockSend = mockInstance.send as ReturnType<typeof vi.fn>;
	});

	afterEach(() => {
		// Restore original env
		process.env = originalEnv;
	});

	it("should construct with correct path prefix", () => {
		const loader = new ParameterStoreLoader("prod");
		expect(loader.getPathPrefix()).toBe("/jolli/app/prod/");
	});

	it("should load parameters and convert to env vars", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend.mockResolvedValueOnce({
			Parameters: [
				{
					Name: "/jolli/app/prod/github/apps/info",
					Value: '{"appId":123}',
				},
				{
					Name: "/jolli/app/prod/some-other/value",
					Value: "test-value",
				},
				{
					Name: "/jolli/app/prod/api/secret",
					Value: "super-secret-value",
				},
				{
					Name: "/jolli/app/prod/private/key",
					Value: "private-key-value",
				},
				{
					Name: "/jolli/app/prod/long/parameter",
					Value: "This is a very long parameter value that exceeds fifty characters to test truncation",
				},
			],
		});

		const result = await loader.load();

		expect(result).toEqual({
			GITHUB_APPS_INFO: '{"appId":123}',
			SOME_OTHER_VALUE: "test-value",
			API_SECRET: "super-secret-value",
			PRIVATE_KEY: "private-key-value",
			LONG_PARAMETER: "This is a very long parameter value that exceeds fifty characters to test truncation",
		});

		// Check that env vars were set
		expect(process.env.GITHUB_APPS_INFO).toBe('{"appId":123}');
		expect(process.env.SOME_OTHER_VALUE).toBe("test-value");
	});

	it("should not apply to process.env when applyToProcessEnv is false", async () => {
		// Clear the env var before the test
		delete process.env.GITHUB_APPS_INFO;

		const loader = new ParameterStoreLoader("prod", "us-east-1", false);

		mockSend.mockResolvedValueOnce({
			Parameters: [
				{
					Name: "/jolli/app/prod/github/apps/info",
					Value: '{"appId":123}',
				},
			],
		});

		const result = await loader.load();

		expect(result).toEqual({
			GITHUB_APPS_INFO: '{"appId":123}',
		});

		// Check that env vars were NOT set
		expect(process.env.GITHUB_APPS_INFO).toBeUndefined();
	});

	it("should handle pagination with NextToken", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend
			.mockResolvedValueOnce({
				Parameters: [
					{
						Name: "/jolli/app/prod/github/apps/info",
						Value: "first-value",
					},
				],
				NextToken: "token-123",
			})
			.mockResolvedValueOnce({
				Parameters: [
					{
						Name: "/jolli/app/prod/another/param",
						Value: "second-value",
					},
				],
			});

		const result = await loader.load();

		expect(result).toEqual({
			GITHUB_APPS_INFO: "first-value",
			ANOTHER_PARAM: "second-value",
		});

		expect(mockSend).toHaveBeenCalledTimes(2);
	});

	it("should skip parameters without Name or Value", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend.mockResolvedValueOnce({
			Parameters: [
				{
					Name: "/jolli/app/prod/github/apps/info",
					Value: "valid-value",
				},
				{
					Name: "/jolli/app/prod/no-value",
					// Missing Value
				},
				{
					// Missing Name
					Value: "no-name",
				},
			],
		});

		const result = await loader.load();

		expect(result).toEqual({
			GITHUB_APPS_INFO: "valid-value",
		});
	});

	it("should cache loaded parameters", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend.mockResolvedValueOnce({
			Parameters: [
				{
					Name: "/jolli/app/prod/github/apps/info",
					Value: "cached-value",
				},
			],
		});

		await loader.load();
		const cached = loader.getCached();

		expect(cached).toEqual({
			GITHUB_APPS_INFO: "cached-value",
		});
	});

	it("should reload parameters", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend
			.mockResolvedValueOnce({
				Parameters: [
					{
						Name: "/jolli/app/prod/github/apps/info",
						Value: "first-load",
					},
				],
			})
			.mockResolvedValueOnce({
				Parameters: [
					{
						Name: "/jolli/app/prod/github/apps/info",
						Value: "second-load",
					},
				],
			});

		const firstResult = await loader.load();
		expect(firstResult.GITHUB_APPS_INFO).toBe("first-load");

		const secondResult = await loader.reload();
		expect(secondResult.GITHUB_APPS_INFO).toBe("second-load");

		expect(mockSend).toHaveBeenCalledTimes(2);
	});

	it("should throw error for parameter with wrong prefix", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend.mockResolvedValueOnce({
			Parameters: [
				{
					Name: "/wrong/prefix/param",
					Value: "value",
				},
			],
		});

		await expect(loader.load()).rejects.toThrow(
			'Parameter name "/wrong/prefix/param" does not start with expected prefix "/jolli/app/prod/"',
		);
	});

	it("should use AWS_REGION from env if region not provided", () => {
		process.env.AWS_REGION = "us-west-2";
		new ParameterStoreLoader("prod");
		// Constructor should have been called with region from env
		expect(SSMClient).toHaveBeenCalledWith({ region: "us-west-2" });
	});

	it("should pass WithDecryption and Recursive flags", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend.mockResolvedValueOnce({
			Parameters: [],
		});

		await loader.load();

		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({
				Path: "/jolli/app/prod/",
				Recursive: true,
				WithDecryption: true,
			}),
		);
	});

	it("should handle empty response", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend.mockResolvedValueOnce({
			Parameters: [],
		});

		const result = await loader.load();
		expect(result).toEqual({});
	});

	it("should handle response with undefined Parameters", async () => {
		const loader = new ParameterStoreLoader("prod", "us-east-1");

		mockSend.mockResolvedValueOnce({
			// Parameters is undefined (not included in response)
		});

		const result = await loader.load();
		expect(result).toEqual({});
	});

	it("should create SSMClient without region when neither region param nor AWS_REGION is set", () => {
		delete process.env.AWS_REGION;

		const loader = new ParameterStoreLoader("prod");

		expect(loader).toBeDefined();
		expect(loader.getPathPrefix()).toBe("/jolli/app/prod/");
	});

	describe("options-based constructor", () => {
		it("should use provided pathBase", () => {
			const loader = new ParameterStoreLoader({
				pstoreEnv: "prod",
				pathBase: "vercel",
			});
			expect(loader.getPathPrefix()).toBe("/jolli/vercel/prod/");
		});

		it("should default pathBase to app", () => {
			const loader = new ParameterStoreLoader({
				pstoreEnv: "staging",
			});
			expect(loader.getPathPrefix()).toBe("/jolli/app/staging/");
		});

		it("should pass credentials to SSMClient when provided", () => {
			const mockCredentials = vi.fn().mockResolvedValue({
				accessKeyId: "AKIATEST",
				secretAccessKey: "secret",
			});

			new ParameterStoreLoader({
				pstoreEnv: "prod",
				region: "us-west-2",
				credentials: mockCredentials,
			});

			expect(SSMClient).toHaveBeenCalledWith({
				region: "us-west-2",
				credentials: mockCredentials,
			});
		});

		it("should not include credentials in SSMClient config when not provided", () => {
			new ParameterStoreLoader({
				pstoreEnv: "prod",
				region: "us-east-1",
			});

			expect(SSMClient).toHaveBeenCalledWith({
				region: "us-east-1",
			});
		});

		it("should use AWS_REGION from env when region not provided in options", () => {
			process.env.AWS_REGION = "eu-west-1";

			new ParameterStoreLoader({
				pstoreEnv: "prod",
			});

			expect(SSMClient).toHaveBeenCalledWith({
				region: "eu-west-1",
			});
		});

		it("should create SSMClient with empty config when no region available", () => {
			delete process.env.AWS_REGION;

			new ParameterStoreLoader({
				pstoreEnv: "dev",
			});

			expect(SSMClient).toHaveBeenCalledWith({});
		});

		it("should default applyToProcessEnv to true", async () => {
			const loader = new ParameterStoreLoader({
				pstoreEnv: "prod",
			});

			mockSend.mockResolvedValueOnce({
				Parameters: [
					{
						Name: "/jolli/app/prod/test/var",
						Value: "test-value",
					},
				],
			});

			await loader.load();

			expect(process.env.TEST_VAR).toBe("test-value");
		});

		it("should respect applyToProcessEnv false in options", async () => {
			delete process.env.TEST_VAR_2;

			const loader = new ParameterStoreLoader({
				pstoreEnv: "prod",
				applyToProcessEnv: false,
			});

			mockSend.mockResolvedValueOnce({
				Parameters: [
					{
						Name: "/jolli/app/prod/test/var-2",
						Value: "should-not-be-set",
					},
				],
			});

			const result = await loader.load();

			expect(result.TEST_VAR_2).toBe("should-not-be-set");
			expect(process.env.TEST_VAR_2).toBeUndefined();
		});
	});
});
