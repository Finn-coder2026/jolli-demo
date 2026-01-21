import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { ConfigReloader } from "./ConfigReloader";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		RefreshCw: ({ className }: { className?: string }) => <div data-testid="refresh-icon" className={className} />,
	};
});

const mockDevToolsClient = {
	getDevToolsInfo: vi.fn().mockResolvedValue({
		enabled: true,
		githubAppCreatorEnabled: true,
		jobTesterEnabled: true,
		dataClearerEnabled: true,
	}),
	completeGitHubAppSetup: vi.fn(),
	triggerDemoJob: vi.fn(),
	clearData: vi.fn(),
	generateDraftWithEdits: vi.fn(),
	reloadConfig: vi.fn(),
};

const mockClient = {
	devTools: () => mockDevToolsClient,
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("ConfigReloader", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockDevToolsClient.reloadConfig.mockResolvedValue({
			success: true,
			message: createMockIntlayerValue("Configuration reloaded successfully"),
		});
	});

	function renderComponent() {
		return renderWithProviders(<ConfigReloader />, { initialPath: createMockIntlayerValue("/devtools") });
	}

	it("should render config reloader with title and description", () => {
		renderComponent();

		expect(screen.getByText("Config Reloader")).toBeDefined();
		expect(screen.getByText("Reload configuration from AWS Parameter Store and clear tenant caches")).toBeDefined();
	});

	it("should have reload button", () => {
		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });
		expect(reloadButton).toBeDefined();
	});

	it("should display note about what the operation does", () => {
		renderComponent();

		expect(
			screen.getByText(
				/This reloads config values from AWS Parameter Store and clears tenant-specific config caches/i,
			),
		).toBeDefined();
	});

	it("should call reloadConfig when button is clicked", async () => {
		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });
		fireEvent.click(reloadButton);

		await waitFor(() => {
			expect(mockDevToolsClient.reloadConfig).toHaveBeenCalled();
		});
	});

	it("should show success message after reloading config", async () => {
		mockDevToolsClient.reloadConfig.mockResolvedValue({
			success: true,
			message: createMockIntlayerValue("Configuration reloaded successfully"),
		});

		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });
		fireEvent.click(reloadButton);

		await waitFor(() => {
			expect(screen.getByText("Configuration reloaded successfully")).toBeDefined();
		});
	});

	it("should show error message when reload fails", async () => {
		mockDevToolsClient.reloadConfig.mockRejectedValue(new Error("Failed to reload configuration"));

		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });
		fireEvent.click(reloadButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to reload configuration")).toBeDefined();
		});
	});

	it("should show generic error when error is not an Error object", async () => {
		mockDevToolsClient.reloadConfig.mockRejectedValue("Some error");

		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });
		fireEvent.click(reloadButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to reload configuration")).toBeDefined();
		});
	});

	it("should disable button and show loading state while reloading", async () => {
		mockDevToolsClient.reloadConfig.mockImplementation(
			() =>
				new Promise(resolve =>
					setTimeout(() => resolve({ success: true, message: createMockIntlayerValue("Reloaded") }), 100),
				),
		);

		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });

		expect(reloadButton.hasAttribute("disabled")).toBe(false);

		fireEvent.click(reloadButton);

		await waitFor(() => {
			expect(reloadButton.hasAttribute("disabled")).toBe(true);
			expect(reloadButton.textContent).toContain("Reloading...");
		});
	});

	it("should spin the refresh icon while reloading", async () => {
		mockDevToolsClient.reloadConfig.mockImplementation(
			() =>
				new Promise(resolve =>
					setTimeout(() => resolve({ success: true, message: createMockIntlayerValue("Reloaded") }), 100),
				),
		);

		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });
		fireEvent.click(reloadButton);

		await waitFor(() => {
			const icon = screen.getByTestId("refresh-icon");
			expect(icon.className).toContain("animate-spin");
		});
	});

	it("should auto-hide success message after 5 seconds", async () => {
		vi.useFakeTimers();
		mockDevToolsClient.reloadConfig.mockResolvedValue({
			success: true,
			message: createMockIntlayerValue("Configuration reloaded successfully"),
		});

		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });
		fireEvent.click(reloadButton);

		// Wait for success message to appear
		await waitFor(() => {
			expect(screen.getByText("Configuration reloaded successfully")).toBeDefined();
		});

		// Fast-forward time by 5 seconds
		vi.advanceTimersByTime(5000);

		// Success message should be gone
		await waitFor(() => {
			expect(screen.queryByText("Configuration reloaded successfully")).toBeNull();
		});

		vi.useRealTimers();
	});

	it("should clear previous error when reload is clicked again", async () => {
		mockDevToolsClient.reloadConfig.mockRejectedValueOnce(new Error("First error"));
		mockDevToolsClient.reloadConfig.mockResolvedValueOnce({
			success: true,
			message: createMockIntlayerValue("Configuration reloaded successfully"),
		});

		renderComponent();

		const reloadButton = screen.getByRole("button", { name: /Reload Configuration$/i });

		// First click - should show error
		fireEvent.click(reloadButton);
		await waitFor(() => {
			expect(screen.getByText("First error")).toBeDefined();
		});

		// Second click - should clear error and show success
		fireEvent.click(reloadButton);
		await waitFor(() => {
			expect(screen.queryByText("First error")).toBeNull();
			expect(screen.getByText("Configuration reloaded successfully")).toBeDefined();
		});
	});
});
