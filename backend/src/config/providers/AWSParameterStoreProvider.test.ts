import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AWSParameterStoreProvider", () => {
	const originalEnv = process.env;
	let mockLoad: ReturnType<typeof vi.fn>;
	let mockGetPathPrefix: ReturnType<typeof vi.fn>;
	let ParameterStoreLoaderMock: ReturnType<typeof vi.fn>;
	let mockCreateAWSCredentialsProvider: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		process.env = { ...originalEnv };

		// Reset all modules to ensure fresh imports
		vi.resetModules();

		// Create fresh mocks for each test
		mockLoad = vi.fn().mockResolvedValue({ LOADED_VAR: "loaded-value" });
		mockGetPathPrefix = vi.fn().mockReturnValue("/jolli/backend/test/");
		ParameterStoreLoaderMock = vi.fn().mockImplementation(() => ({
			load: mockLoad,
			getPathPrefix: mockGetPathPrefix,
		}));
		mockCreateAWSCredentialsProvider = vi.fn().mockReturnValue(undefined);

		// Mock the modules
		vi.doMock("../ParameterStoreLoader", () => ({
			ParameterStoreLoader: ParameterStoreLoaderMock,
		}));

		vi.doMock("../../util/AWSCredentials", () => ({
			createAWSCredentialsProvider: mockCreateAWSCredentialsProvider,
		}));

		// Mock withRetry to pass through to the operation directly (no actual retries in tests)
		vi.doMock("../../util/Retry", () => ({
			withRetry: vi.fn().mockImplementation((operation: () => Promise<unknown>) => operation()),
		}));
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("isAvailable", () => {
		it("returns true when PSTORE_ENV is set", async () => {
			process.env.PSTORE_ENV = "prod";
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.isAvailable()).toBe(true);
		});

		it("returns false when PSTORE_ENV is not set", async () => {
			delete process.env.PSTORE_ENV;
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.isAvailable()).toBe(false);
		});

		it("returns false when PSTORE_ENV is empty string", async () => {
			process.env.PSTORE_ENV = "";
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.isAvailable()).toBe(false);
		});

		it("returns false when SKIP_PSTORE is true, even if PSTORE_ENV is set", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.SKIP_PSTORE = "true";
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.isAvailable()).toBe(false);
		});

		it("returns true when SKIP_PSTORE is false and PSTORE_ENV is set", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.SKIP_PSTORE = "false";
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.isAvailable()).toBe(true);
		});
	});

	describe("load", () => {
		it("returns empty object when PSTORE_ENV is not set", async () => {
			delete process.env.PSTORE_ENV;
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			const result = await provider.load();
			expect(result).toEqual({});
		});

		it("loads from ParameterStoreLoader when PSTORE_ENV is set", async () => {
			process.env.PSTORE_ENV = "test";
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			const result = await provider.load();
			expect(result).toEqual({ LOADED_VAR: "loaded-value" });
			expect(mockLoad).toHaveBeenCalled();
		});

		it("defaults to app path base when no PSTORE_PATH_BASE is set", async () => {
			process.env.PSTORE_ENV = "dev";
			delete process.env.PSTORE_PATH_BASE;

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "dev",
				pathBase: "app",
				applyToProcessEnv: false,
				credentials: undefined,
			});
		});

		it("uses PSTORE_PATH_BASE when set to backend", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.PSTORE_PATH_BASE = "backend";

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "prod",
				pathBase: "backend",
				applyToProcessEnv: false,
				credentials: undefined,
			});
		});

		it("uses PSTORE_PATH_BASE when set to app", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.PSTORE_PATH_BASE = "app";

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "prod",
				pathBase: "app",
				applyToProcessEnv: false,
				credentials: undefined,
			});
		});

		it("throws error if ParameterStoreLoader fails", async () => {
			process.env.PSTORE_ENV = "test";
			mockLoad.mockRejectedValue(new Error("AWS error"));

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await expect(provider.load()).rejects.toThrow("AWS error");
		});
	});

	describe("getLoader", () => {
		it("returns null before load is called", async () => {
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.getLoader()).toBeNull();
		});

		it("returns loader after load is called", async () => {
			process.env.PSTORE_ENV = "test";
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();
			expect(provider.getLoader()).not.toBeNull();
		});
	});

	describe("properties", () => {
		it("has correct name", async () => {
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.name).toBe("aws-parameter-store");
		});

		it("has correct priority (highest)", async () => {
			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			expect(provider.priority).toBe(1);
		});
	});

	describe("credentials", () => {
		it("calls createAWSCredentialsProvider with no role ARN by default", async () => {
			process.env.PSTORE_ENV = "dev";
			delete process.env.AWS_OIDC_ROLE_ARN;
			process.env.AWS_REGION = "us-west-2";

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(mockCreateAWSCredentialsProvider).toHaveBeenCalledWith({
				region: "us-west-2",
			});
		});

		it("calls createAWSCredentialsProvider with role ARN when set", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.AWS_OIDC_ROLE_ARN = "arn:aws:iam::123456789012:role/JolliRole";
			process.env.AWS_REGION = "us-east-1";

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(mockCreateAWSCredentialsProvider).toHaveBeenCalledWith({
				roleArn: "arn:aws:iam::123456789012:role/JolliRole",
				region: "us-east-1",
			});
		});

		it("passes credentials provider to ParameterStoreLoader when configured", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.AWS_OIDC_ROLE_ARN = "arn:aws:iam::123456789012:role/JolliRole";

			const mockCredentialsProvider = vi.fn().mockResolvedValue({
				accessKeyId: "AKIATEST",
				secretAccessKey: "secret",
			});
			mockCreateAWSCredentialsProvider.mockReturnValue(mockCredentialsProvider);

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "prod",
				pathBase: "app",
				applyToProcessEnv: false,
				credentials: mockCredentialsProvider,
			});
		});

		it("uses default credentials when no role ARN is set", async () => {
			process.env.PSTORE_ENV = "preview";
			delete process.env.AWS_OIDC_ROLE_ARN;
			delete process.env.AWS_REGION;

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(mockCreateAWSCredentialsProvider).toHaveBeenCalledWith({});

			// Should pass undefined credentials (default chain)
			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "preview",
				pathBase: "app",
				applyToProcessEnv: false,
				credentials: undefined,
			});
		});
	});
});
