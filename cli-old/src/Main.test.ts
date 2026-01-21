import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function getMockLogger() {
	return vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	}));
}

describe("Main CLI", () => {
	let mockClient: {
		status: ReturnType<typeof vi.fn>;
		sync: ReturnType<typeof vi.fn>;
	};
	let consoleLogSpy: ReturnType<typeof vi.spyOn>;
	let originalArgv: Array<string>;
	let originalEnv: NodeJS.ProcessEnv;
	let mockLoadAuthToken: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Save original values
		originalArgv = process.argv;
		originalEnv = { ...process.env };

		// Mock console methods
		consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
			// intentionally empty
		});

		// Mock client
		mockClient = {
			status: vi.fn(),
			sync: vi.fn(),
		};

		// Mock auth token loading
		mockLoadAuthToken = vi.fn().mockResolvedValue(undefined);

		// Clear module cache to allow re-importing
		vi.resetModules();
	});

	afterEach(() => {
		// Restore original values
		process.argv = originalArgv;
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	it("should call client.status and log result when status command is executed", async () => {
		const mockStatusResult = "Server is running";
		mockClient.status.mockResolvedValue(mockStatusResult);

		vi.doMock("jolli-common", () => ({
			createClient: vi.fn(() => mockClient),
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		// Set up argv to simulate running the status command
		process.argv = ["node", "jolli", "status"];

		await import("./Main");

		// Wait for async action to complete

		expect(mockClient.status).toHaveBeenCalled();
		expect(consoleLogSpy).toHaveBeenCalledWith(mockStatusResult);
	});

	it("should use default URL if JOLLI_URL is not set", async () => {
		delete process.env.JOLLI_URL;
		mockClient.status.mockResolvedValue("ok");

		const createClientMock = vi.fn(() => mockClient);
		vi.doMock("jolli-common", () => ({
			createClient: createClientMock,
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		vi.doMock("./util/Logger", () => ({
			getLog: getMockLogger(),
		}));

		process.argv = ["node", "jolli", "status"];
		await import("./Main");

		// Wait for execution

		// Check that createClient was called with correct arguments
		expect(createClientMock).toHaveBeenCalledTimes(1);
		const [receivedUrl, receivedAuth] = createClientMock.mock.calls[0] as unknown as [string, unknown];

		// URL should be the default (either 8034 or 7034 depending on .env)
		expect(receivedUrl).toMatch(/^http:\/\/localhost:(7034|8034)$/);
		expect(receivedAuth).toBe(undefined);
	});

	it("should use custom URL if JOLLI_URL is set", async () => {
		process.env.JOLLI_URL = "https://custom-url.com";
		mockClient.status.mockResolvedValue("ok");

		const createClientMock = vi.fn(() => mockClient);
		vi.doMock("jolli-common", () => ({
			createClient: createClientMock,
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		vi.doMock("./util/Logger", () => ({
			getLog: getMockLogger(),
		}));

		process.argv = ["node", "jolli", "status"];
		await import("./Main");

		// Wait for execution

		expect(createClientMock).toHaveBeenCalledWith("https://custom-url.com", undefined);
	});

	it("should use empty string URL if JOLLI_URL is empty string", async () => {
		process.env.JOLLI_URL = "";
		mockClient.status.mockResolvedValue("ok");

		const createClientMock = vi.fn(() => mockClient);
		vi.doMock("jolli-common", () => ({
			createClient: createClientMock,
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		vi.doMock("./util/Logger", () => ({
			getLog: getMockLogger(),
		}));

		process.argv = ["node", "jolli", "status"];
		await import("./Main");

		// Wait for execution

		// Empty string is truthy for ??, so it should be used
		expect(createClientMock).toHaveBeenCalledWith("", undefined);
	});

	it("should use default URL if JOLLI_URL is explicitly null", async () => {
		// @ts-expect-error - Testing null case
		process.env.JOLLI_URL = null;
		mockClient.status.mockResolvedValue("ok");

		const createClientMock = vi.fn(() => mockClient);
		vi.doMock("jolli-common", () => ({
			createClient: createClientMock,
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		vi.doMock("./util/Logger", () => ({
			getLog: getMockLogger(),
		}));

		process.argv = ["node", "jolli", "status"];
		await import("./Main");

		// Wait for execution

		expect(createClientMock).toHaveBeenCalledTimes(1);
		const [receivedUrl, receivedAuth] = createClientMock.mock.calls[0] as unknown as [string, unknown];

		// URL should be the default (either 8034 or 7034 depending on .env)
		expect(receivedUrl).toMatch(/^http:\/\/localhost:(7034|8034)$/);
		expect(receivedAuth).toBe(undefined);
	});

	it("should handle errors when status command fails", async () => {
		mockClient.status.mockRejectedValue(new Error("Connection failed"));

		vi.doMock("jolli-common", () => ({
			createClient: vi.fn(() => mockClient),
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		process.argv = ["node", "jolli", "status"];

		// Catch unhandled promise rejection
		const unhandledRejections: Array<Error> = [];
		const rejectionHandler = (reason: Error) => {
			unhandledRejections.push(reason);
		};
		process.on("unhandledRejection", rejectionHandler);

		await import("./Main");

		// Wait for the rejection to be processed in the event loop
		await new Promise(resolve => setImmediate(resolve));

		expect(mockClient.status).toHaveBeenCalled();
		expect(unhandledRejections).toHaveLength(1);
		expect(unhandledRejections[0].message).toBe("Connection failed");

		process.off("unhandledRejection", rejectionHandler);
	});

	it("should call client.sync and log success when sync command is executed", async () => {
		const testUrl = "https://github.com/owner/repo";
		mockClient.sync.mockResolvedValue(undefined);

		vi.doMock("jolli-common", () => ({
			createClient: vi.fn(() => mockClient),
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		process.argv = ["node", "jolli", "sync", testUrl];

		await import("./Main");

		// Wait for async action to complete

		expect(mockClient.sync).toHaveBeenCalledWith(testUrl);
		expect(consoleLogSpy).toHaveBeenCalledWith(`Successfully synced ${testUrl}`);
	});

	it("should handle login command success", async () => {
		const mockBrowserLogin = vi.fn().mockResolvedValue(undefined);

		vi.doMock("jolli-common", () => ({
			createClient: vi.fn(() => mockClient),
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		vi.doMock("./util/Login", () => ({
			browserLogin: mockBrowserLogin,
		}));

		process.argv = ["node", "jolli", "login"];

		await import("./Main");

		expect(mockBrowserLogin).toHaveBeenCalled();
		expect(consoleLogSpy).toHaveBeenCalledWith("Successfully logged in!");
	});

	it("should handle logout command", async () => {
		const mockClearAuthToken = vi.fn().mockResolvedValue(undefined);

		vi.doMock("jolli-common", () => ({
			createClient: vi.fn(() => mockClient),
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
			clearAuthToken: mockClearAuthToken,
		}));

		process.argv = ["node", "jolli", "logout"];

		await import("./Main");

		expect(mockClearAuthToken).toHaveBeenCalled();
		expect(consoleLogSpy).toHaveBeenCalledWith("Successfully logged out");
	});

	it("should handle interactive command", async () => {
		delete process.env.JOLLI_URL;
		const mockStartInteractiveMode = vi.fn().mockResolvedValue(undefined);

		vi.doMock("jolli-common", () => ({
			createClient: vi.fn(() => mockClient),
			getLog: getMockLogger(),
			createLog: getMockLogger(),
		}));

		vi.doMock("./util/Config", () => ({
			loadAuthToken: mockLoadAuthToken,
		}));

		vi.doMock("./interactive/index.js", () => ({
			startInteractiveMode: mockStartInteractiveMode,
		}));

		process.argv = ["node", "jolli", "interactive"];

		await import("./Main");

		// Wait for async action to complete (dynamic import)
		await new Promise(resolve => setImmediate(resolve));

		expect(mockStartInteractiveMode).toHaveBeenCalled();
		const [receivedClient, receivedUrl] = mockStartInteractiveMode.mock.calls[0] as unknown as [unknown, string];
		expect(receivedClient).toBe(mockClient);
		// URL should be the default (either 8034 or 7034 depending on .env)
		expect(receivedUrl).toMatch(/^http:\/\/localhost:(7034|8034)$/);
	});
});
