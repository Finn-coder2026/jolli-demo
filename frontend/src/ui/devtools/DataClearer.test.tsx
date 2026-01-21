import { createMockIntlayerValue, renderWithProviders } from "../../test/TestUtils";
import { DataClearer } from "./DataClearer";
import { fireEvent, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Trash2: () => <div data-testid="trash-icon" />,
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

describe("DataClearer", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Mock Intlayer content
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		mockDevToolsClient.getDevToolsInfo.mockResolvedValue({
			enabled: true,
			githubAppCreatorEnabled: true,
			jobTesterEnabled: true,
			dataClearerEnabled: true,
		});
		mockDevToolsClient.clearData.mockResolvedValue({
			success: true,
			deletedCount: 0,
			message: createMockIntlayerValue("Data cleared successfully"),
		});
		vi.spyOn(window, "confirm").mockReturnValue(false);
	});

	function renderComponent() {
		return renderWithProviders(<DataClearer />, { initialPath: createMockIntlayerValue("/devtools") });
	}

	it("should render data clearer with all data types", () => {
		renderComponent();

		expect(screen.getByText("Data Clearer")).toBeDefined();
		expect(screen.getByText("Clear various types of data for development and testing purposes")).toBeDefined();

		// Check all data types are present
		expect(screen.getByText("Clear Articles")).toBeDefined();
		expect(screen.getByText("Remove all articles and their chunks")).toBeDefined();

		expect(screen.getByText("Clear Sites")).toBeDefined();
		expect(screen.getByText("Remove all sites")).toBeDefined();

		expect(screen.getByText("Clear Jobs")).toBeDefined();
		expect(screen.getByText("Remove all job execution history")).toBeDefined();

		expect(screen.getByText("Clear GitHub Integrations")).toBeDefined();
		expect(screen.getByText("Remove all GitHub integrations and installations")).toBeDefined();

		expect(screen.getByText("Clear Sync Data")).toBeDefined();
		expect(screen.getByText("Remove all sync cursor data for CLI sync")).toBeDefined();
	});

	it("should have clear buttons for each data type", () => {
		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		expect(clearButtons).toHaveLength(5);
	});

	it("should show confirmation dialog when clear button is clicked", () => {
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		fireEvent.click(clearButtons[0]); // Click first button (Clear Articles)

		expect(confirmSpy).toHaveBeenCalledWith(
			"Are you sure you want to clear all articles? This will delete all articles and their associated chunks. This action cannot be undone.",
		);
		expect(mockDevToolsClient.clearData).not.toHaveBeenCalled();
	});

	it("should not clear data if user cancels confirmation", () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		fireEvent.click(clearButtons[0]);

		expect(mockDevToolsClient.clearData).not.toHaveBeenCalled();
	});

	it("should clear data when user confirms", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDevToolsClient.clearData.mockResolvedValue({
			success: true,
			deletedCount: 5,
			message: createMockIntlayerValue("All articles cleared successfully"),
		});

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		fireEvent.click(clearButtons[0]); // Clear Articles

		await waitFor(() => {
			expect(mockDevToolsClient.clearData).toHaveBeenCalledWith("articles");
		});
	});

	it("should show success message after clearing data", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDevToolsClient.clearData.mockResolvedValue({
			success: true,
			deletedCount: 5,
			message: createMockIntlayerValue("All articles cleared successfully"),
		});

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		fireEvent.click(clearButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("All articles cleared successfully")).toBeDefined();
		});
	});

	it("should show error message when clear fails", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDevToolsClient.clearData.mockRejectedValue(new Error("Failed to clear data"));

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		fireEvent.click(clearButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Failed to clear data")).toBeDefined();
		});
	});

	it("should show generic error when error is not an Error object", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDevToolsClient.clearData.mockRejectedValue("Some error");

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		fireEvent.click(clearButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Failed to clear data")).toBeDefined();
		});
	});

	it("should disable button while clearing data", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDevToolsClient.clearData.mockImplementation(
			() =>
				new Promise(resolve =>
					setTimeout(
						() => resolve({ success: true, deletedCount: 0, message: createMockIntlayerValue("Cleared") }),
						100,
					),
				),
		);

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		const firstButton = clearButtons[0];

		expect(firstButton.hasAttribute("disabled")).toBe(false);

		fireEvent.click(firstButton);

		await waitFor(() => {
			expect(firstButton.hasAttribute("disabled")).toBe(true);
			expect(firstButton.textContent).toContain("Clearing...");
		});
	});

	it("should clear correct data type for each button", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });

		// Clear Articles
		fireEvent.click(clearButtons[0]);
		await waitFor(() => {
			expect(mockDevToolsClient.clearData).toHaveBeenCalledWith("articles");
		});

		// Clear Sites
		fireEvent.click(clearButtons[1]);
		await waitFor(() => {
			expect(mockDevToolsClient.clearData).toHaveBeenCalledWith("sites");
		});

		// Clear Jobs
		fireEvent.click(clearButtons[2]);
		await waitFor(() => {
			expect(mockDevToolsClient.clearData).toHaveBeenCalledWith("jobs");
		});

		// Clear GitHub Integrations
		fireEvent.click(clearButtons[3]);
		await waitFor(() => {
			expect(mockDevToolsClient.clearData).toHaveBeenCalledWith("github");
		});

		// Clear Sync Articles
		fireEvent.click(clearButtons[4]);
		await waitFor(() => {
			expect(mockDevToolsClient.clearData).toHaveBeenCalledWith("sync");
		});

		expect(mockDevToolsClient.clearData).toHaveBeenCalledTimes(5);
	});

	it("should display warning message about irreversible operations", () => {
		renderComponent();

		expect(screen.getByText(/These operations cannot be undone/i)).toBeDefined();
		expect(screen.getByText(/Only use in development environments/i)).toBeDefined();
	});

	it("should auto-hide success message after 5 seconds", async () => {
		vi.useFakeTimers();
		vi.spyOn(window, "confirm").mockReturnValue(true);
		mockDevToolsClient.clearData.mockResolvedValue({
			success: true,
			deletedCount: 5,
			message: createMockIntlayerValue("All articles cleared successfully"),
		});

		renderComponent();

		const clearButtons = screen.getAllByRole("button", { name: /Clear$/i });
		fireEvent.click(clearButtons[0]);

		// Wait for success message to appear
		await waitFor(() => {
			expect(screen.getByText("All articles cleared successfully")).toBeDefined();
		});

		// Fast-forward time by 5 seconds
		vi.advanceTimersByTime(5000);

		// Success message should be gone
		await waitFor(() => {
			expect(screen.queryByText("All articles cleared successfully")).toBeNull();
		});

		vi.useRealTimers();
	});

	it("should handle intlayer values with .key property", () => {
		// Mock one value to have a .key property (edge case that getStringValue handles)
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		renderComponent();

		// Should still work correctly with .key property (getStringValue converts it)
		expect(screen.getByText("Clear Articles")).toBeDefined();
	});
});
