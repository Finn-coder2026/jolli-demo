import { ClientProvider } from "./ClientContext";
import { DevToolsProvider, useDevTools } from "./DevToolsContext";
import { render, waitFor } from "@testing-library/preact";
import type { DevToolsInfoResponse } from "jolli-common";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDevToolsInfo: DevToolsInfoResponse = {
	enabled: true,
	githubAppCreatorEnabled: true,
	jobTesterEnabled: true,
	dataClearerEnabled: true,
	draftGeneratorEnabled: true,
	githubApp: {
		defaultOrg: "test-org",
		defaultManifest: { name: "test-app" },
	},
};

const mockClient = {
	devTools: vi.fn(() => ({
		getDevToolsInfo: vi.fn().mockResolvedValue(mockDevToolsInfo),
	})),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("DevToolsContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should provide dev tools info when enabled", async () => {
		let context: ReturnType<typeof useDevTools> | undefined;

		function TestComponent(): ReactElement {
			context = useDevTools();
			return <div>Test</div>;
		}

		render(
			<ClientProvider>
				<DevToolsProvider>
					<TestComponent />
				</DevToolsProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(context?.devToolsEnabled).toBe(true);
			expect(context?.githubAppCreatorEnabled).toBe(true);
			expect(context?.jobTesterEnabled).toBe(true);
			expect(context?.devToolsInfo).toEqual(mockDevToolsInfo);
			expect(context?.isLoading).toBe(false);
			expect(context?.error).toBeUndefined();
		});
	});

	it("should handle loading state", () => {
		let context: ReturnType<typeof useDevTools> | undefined;

		function TestComponent(): ReactElement {
			context = useDevTools();
			return <div>Test</div>;
		}

		render(
			<ClientProvider>
				<DevToolsProvider>
					<TestComponent />
				</DevToolsProvider>
			</ClientProvider>,
		);

		// Initially should be loading
		expect(context?.isLoading).toBe(true);
	});

	it("should provide disabled flags when dev tools are disabled", async () => {
		mockClient.devTools.mockReturnValue({
			getDevToolsInfo: vi.fn().mockResolvedValue({
				enabled: false,
				githubAppCreatorEnabled: false,
				jobTesterEnabled: false,
			}),
		});

		let context: ReturnType<typeof useDevTools> | undefined;

		function TestComponent(): ReactElement {
			context = useDevTools();
			return <div>Test</div>;
		}

		render(
			<ClientProvider>
				<DevToolsProvider>
					<TestComponent />
				</DevToolsProvider>
			</ClientProvider>,
		);

		// Provider always renders children but provides disabled flags
		await waitFor(() => {
			expect(context?.devToolsEnabled).toBe(false);
			expect(context?.githubAppCreatorEnabled).toBe(false);
			expect(context?.jobTesterEnabled).toBe(false);
			expect(context?.isLoading).toBe(false);
		});
	});

	it("should handle errors when fetching dev tools info", async () => {
		mockClient.devTools.mockReturnValue({
			getDevToolsInfo: vi.fn().mockRejectedValue(new Error("Network error")),
		});

		let context: ReturnType<typeof useDevTools> | undefined;

		function TestComponent(): ReactElement {
			context = useDevTools();
			return <div>Test</div>;
		}

		render(
			<ClientProvider>
				<DevToolsProvider>
					<TestComponent />
				</DevToolsProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(context?.error).toBe("Network error");
			expect(context?.isLoading).toBe(false);
		});
	});

	it("should handle component-level flags", async () => {
		mockClient.devTools.mockReturnValue({
			getDevToolsInfo: vi.fn().mockResolvedValue({
				enabled: true,
				githubAppCreatorEnabled: false,
				jobTesterEnabled: true,
			}),
		});

		let context: ReturnType<typeof useDevTools> | undefined;

		function TestComponent(): ReactElement {
			context = useDevTools();
			return <div>Test</div>;
		}

		render(
			<ClientProvider>
				<DevToolsProvider>
					<TestComponent />
				</DevToolsProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(context?.devToolsEnabled).toBe(true);
			expect(context?.githubAppCreatorEnabled).toBe(false);
			expect(context?.jobTesterEnabled).toBe(true);
		});
	});

	it("should throw error when useDevTools is used outside provider", () => {
		function TestComponent(): ReactElement {
			useDevTools();
			return <div>Test</div>;
		}

		expect(() => {
			render(<TestComponent />);
		}).toThrow("useDevTools must be used within a DevToolsProvider");
	});

	it("should handle non-Error exceptions", async () => {
		mockClient.devTools.mockReturnValue({
			getDevToolsInfo: vi.fn().mockRejectedValue("String error"),
		});

		let context: ReturnType<typeof useDevTools> | undefined;

		function TestComponent(): ReactElement {
			context = useDevTools();
			return <div>Test</div>;
		}

		render(
			<ClientProvider>
				<DevToolsProvider>
					<TestComponent />
				</DevToolsProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(context?.error).toBe("Failed to load dev tools info");
			expect(context?.isLoading).toBe(false);
		});
	});
});
