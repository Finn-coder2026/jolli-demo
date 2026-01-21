import { TextDecoder, TextEncoder } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Ensure TextEncoder/TextDecoder are set up before any imports that might use intlayer
// biome-ignore lint/suspicious/noExplicitAny: required for global type override
global.TextEncoder = TextEncoder as any;
// biome-ignore lint/suspicious/noExplicitAny: required for global type override
global.TextDecoder = TextDecoder as any;

// Mock the logger
vi.mock("./util/Logger", () => ({
	getLog: vi.fn(() => ({
		info: vi.fn(),
		debug: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
	})),
}));

// Mock MainElement
vi.mock("./ui/MainElement", () => ({
	MainElement: () => <div data-testid="main-element">MainElement</div>,
}));

// Mock preact render
vi.mock("preact", () => ({
	render: vi.fn(),
}));

// Mock react-dom/client
vi.mock("react-dom/client", () => ({
	createRoot: vi.fn(() => ({
		render: vi.fn(),
	})),
}));

// Mock react-intlayer to avoid esbuild issues
vi.mock("react-intlayer", () => ({
	IntlayerProvider: ({ children }: { children: unknown }) => children,
	useLocale: vi.fn(() => ({ locale: "en", setLocale: vi.fn() })),
}));

describe("Main", () => {
	let mockAppElement: HTMLDivElement;
	let mockQuerySelector: ReturnType<typeof vi.fn>;
	let originalNodeEnv: string | undefined;

	beforeEach(() => {
		// Save original NODE_ENV
		originalNodeEnv = process.env.NODE_ENV;

		// Create mock app element
		mockAppElement = document.createElement("div");
		mockAppElement.id = "app";

		// Mock querySelector
		mockQuerySelector = vi.fn((selector: string) => {
			if (selector === "#app") {
				return mockAppElement;
			}
			return null;
		});
		document.querySelector = mockQuerySelector;

		// Clear all mocks
		vi.clearAllMocks();
	});

	afterEach(() => {
		// Restore NODE_ENV
		if (originalNodeEnv !== undefined) {
			process.env.NODE_ENV = originalNodeEnv;
		} else {
			delete process.env.NODE_ENV;
		}
	});

	it("should render using createRoot in development mode", async () => {
		process.env.NODE_ENV = "development";

		const { createRoot } = await import("react-dom/client");
		const mockRender = vi.fn();
		vi.mocked(createRoot).mockReturnValue({ render: mockRender } as unknown as ReturnType<typeof createRoot>);

		// Import Main to trigger execution
		await import("./Main");

		expect(document.querySelector).toHaveBeenCalledWith("#app");
		expect(createRoot).toHaveBeenCalledWith(mockAppElement);
		expect(mockRender).toHaveBeenCalled();
	});

	it("should render using preact render in production mode", async () => {
		process.env.NODE_ENV = "production";

		const { render } = await import("preact");

		// Reset modules to re-import Main with new NODE_ENV
		vi.resetModules();

		// Re-setup mocks after reset
		mockQuerySelector = vi.fn((selector: string) => {
			if (selector === "#app") {
				return mockAppElement;
			}
			return null;
		});
		document.querySelector = mockQuerySelector;

		// Import Main to trigger execution
		await import("./Main");

		expect(document.querySelector).toHaveBeenCalledWith("#app");
		expect(render).toHaveBeenCalledWith(expect.anything(), mockAppElement);
	});

	it("should log user agent on startup", async () => {
		const mockInfo = vi.fn();
		const mockLogger = {
			info: mockInfo,
			debug: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
		};

		// Re-mock getLog to return our logger
		vi.doMock("./util/Logger", () => ({
			getLog: vi.fn(() => mockLogger),
		}));

		// Reset modules and re-import
		vi.resetModules();
		await import("./Main");

		// Verify logger was called
		expect(mockInfo).toHaveBeenCalled();
		const calls = mockInfo.mock.calls;
		const userAgentCall = calls.find((call: Array<unknown>) => {
			const arg = call[0];
			return typeof arg === "string" && arg.includes("Jolli running on");
		});
		expect(userAgentCall).toBeDefined();
	});

	it("should not render if app element is not found", async () => {
		// Mock querySelector to return null
		document.querySelector = vi.fn(() => null);

		const { render } = await import("preact");
		const { createRoot } = await import("react-dom/client");

		// Reset modules and re-import
		vi.resetModules();
		await import("./Main");

		// Neither render method should be called
		expect(render).not.toHaveBeenCalled();
		expect(createRoot).not.toHaveBeenCalled();
	});

	it("should not render if app element is not an HTMLElement", async () => {
		// Mock querySelector to return a non-HTMLElement
		const textNode = document.createTextNode("text");
		document.querySelector = vi.fn(() => textNode as unknown as Element);

		const { render } = await import("preact");
		const { createRoot } = await import("react-dom/client");

		// Reset modules and re-import
		vi.resetModules();
		await import("./Main");

		// Neither render method should be called
		expect(render).not.toHaveBeenCalled();
		expect(createRoot).not.toHaveBeenCalled();
	});

	it("should import Main.css", async () => {
		// This test verifies the CSS import doesn't cause errors
		await expect(import("./Main")).resolves.toBeDefined();
	});

	it("should use getLog with import.meta", async () => {
		const { getLog } = await import("./util/Logger");

		// Reset and re-import to trigger getLog call
		vi.resetModules();
		await import("./Main");

		// Verify getLog was called (should be called with import.meta)
		expect(getLog).toHaveBeenCalled();
		const callArg = vi.mocked(getLog).mock.calls[0]?.[0];

		// The argument should either be a string or an ImportMeta object
		expect(callArg).toBeDefined();
	});
});
