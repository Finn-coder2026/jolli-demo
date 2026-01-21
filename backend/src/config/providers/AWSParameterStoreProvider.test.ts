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

		it("uses backend path base when not on Vercel", async () => {
			process.env.PSTORE_ENV = "dev";
			delete process.env.VERCEL;

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "dev",
				pathBase: "backend",
				applyToProcessEnv: false,
				credentials: undefined,
			});
		});

		it("uses vercel path base when on Vercel", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.VERCEL = "1";

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "prod",
				pathBase: "vercel",
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

	describe("OIDC credentials", () => {
		it("calls createAWSCredentialsProvider with correct options when not on Vercel", async () => {
			process.env.PSTORE_ENV = "dev";
			delete process.env.VERCEL;
			delete process.env.AWS_OIDC_ROLE_ARN;
			process.env.AWS_REGION = "us-west-2";

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(mockCreateAWSCredentialsProvider).toHaveBeenCalledWith({
				roleArn: undefined,
				isVercel: false,
				region: "us-west-2",
			});
		});

		it("calls createAWSCredentialsProvider with role ARN when on Vercel with OIDC", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.VERCEL = "1";
			process.env.AWS_OIDC_ROLE_ARN = "arn:aws:iam::123456789012:role/JolliVercelRole";
			process.env.AWS_REGION = "us-east-1";

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(mockCreateAWSCredentialsProvider).toHaveBeenCalledWith({
				roleArn: "arn:aws:iam::123456789012:role/JolliVercelRole",
				isVercel: true,
				region: "us-east-1",
			});
		});

		it("passes credentials provider to ParameterStoreLoader when OIDC is configured", async () => {
			process.env.PSTORE_ENV = "prod";
			process.env.VERCEL = "1";
			process.env.AWS_OIDC_ROLE_ARN = "arn:aws:iam::123456789012:role/JolliVercelRole";

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
				pathBase: "vercel",
				applyToProcessEnv: false,
				credentials: mockCredentialsProvider,
			});
		});

		it("uses default credentials when on Vercel but no role ARN", async () => {
			process.env.PSTORE_ENV = "preview";
			process.env.VERCEL = "1";
			delete process.env.AWS_OIDC_ROLE_ARN;
			delete process.env.AWS_REGION;

			const { AWSParameterStoreProvider } = await import("./AWSParameterStoreProvider");
			const provider = new AWSParameterStoreProvider();
			await provider.load();

			expect(mockCreateAWSCredentialsProvider).toHaveBeenCalledWith({
				roleArn: undefined,
				isVercel: true,
				region: undefined,
			});

			// Should pass undefined credentials (default chain)
			expect(ParameterStoreLoaderMock).toHaveBeenCalledWith({
				pstoreEnv: "preview",
				pathBase: "vercel",
				applyToProcessEnv: false,
				credentials: undefined,
			});
		});
	});
});
