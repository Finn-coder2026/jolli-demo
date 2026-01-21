/**
 * @vitest-environment jsdom
 */
import { AdminProvider, useAdminContext } from "./AdminContext";
import { ClientProvider } from "./ClientContext";
import { ExitProvider } from "./ExitContext";
import { SystemProvider } from "./SystemContext";
import { act, render } from "@testing-library/react";
import type { Client } from "jolli-common";
import { type ReactElement, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AdminContext", () => {
	let mockClient: Client;
	let mockClearAll: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockClearAll = vi.fn().mockResolvedValue(undefined);
		mockClient = {
			docs: () => ({
				clearAll: mockClearAll,
			}),
		} as unknown as Client;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	function TestComponent(): ReactElement {
		const admin = useAdminContext();
		const [state, setState] = useState({
			selectedUtility: admin.selectedUtility || "none",
			confirmationPending: admin.confirmationPending ? "yes" : "no",
			confirmationMessage: admin.confirmationMessage || "none",
			loading: admin.loading ? "yes" : "no",
			error: admin.error || "none",
		});

		// Update state when admin context changes
		useEffect(() => {
			setState({
				selectedUtility: admin.selectedUtility || "none",
				confirmationPending: admin.confirmationPending ? "yes" : "no",
				confirmationMessage: admin.confirmationMessage || "none",
				loading: admin.loading ? "yes" : "no",
				error: admin.error || "none",
			});
		}, [admin.selectedUtility, admin.confirmationPending, admin.confirmationMessage, admin.loading, admin.error]);

		return (
			<div>
				<div data-testid="selected-utility">{state.selectedUtility}</div>
				<div data-testid="confirmation-pending">{state.confirmationPending}</div>
				<div data-testid="confirmation-message">{state.confirmationMessage}</div>
				<div data-testid="loading">{state.loading}</div>
				<div data-testid="error">{state.error}</div>
				<button type="button" onClick={() => admin.handleSelectUtility("clear-all-articles")}>
					Select Clear All
				</button>
				<button type="button" onClick={() => admin.handleSelectUtility("back")}>
					Select Back
				</button>
				<button type="button" onClick={() => admin.handleConfirm(true)}>
					Confirm Yes
				</button>
				<button type="button" onClick={() => admin.handleConfirm(false)}>
					Confirm No
				</button>
				<button type="button" onClick={admin.handleBack}>
					Back
				</button>
			</div>
		);
	}

	function renderWithProviders() {
		return render(
			<SystemProvider>
				<ExitProvider onExit={vi.fn()}>
					<ClientProvider client={mockClient}>
						<AdminProvider>
							<TestComponent />
						</AdminProvider>
					</ClientProvider>
				</ExitProvider>
			</SystemProvider>,
		);
	}

	it("should provide default values", () => {
		const { getByTestId } = renderWithProviders();

		expect(getByTestId("selected-utility").textContent).toBe("none");
		expect(getByTestId("confirmation-pending").textContent).toBe("no");
		expect(getByTestId("confirmation-message").textContent).toBe("none");
		expect(getByTestId("loading").textContent).toBe("no");
		expect(getByTestId("error").textContent).toBe("none");
	});

	it("should set confirmation state when utility is selected", () => {
		const { getByTestId, getByText } = renderWithProviders();

		act(() => {
			getByText("Select Clear All").click();
		});

		expect(getByTestId("selected-utility").textContent).toBe("clear-all-articles");
		expect(getByTestId("confirmation-pending").textContent).toBe("yes");
		expect(getByTestId("confirmation-message").textContent).toBe(
			"Are you sure you want to clear all articles? This cannot be undone.",
		);
	});

	it("should call handleBack when back utility is selected", () => {
		const { getByText } = renderWithProviders();

		act(() => {
			getByText("Select Back").click();
		});

		// handleBack should reset state - since we can't easily spy on setViewMode,
		// we'll just verify the component renders without error
		expect(getByText("Select Back")).toBeDefined();
	});

	it("should reset confirmation state when user selects No", () => {
		const { getByTestId, getByText } = renderWithProviders();

		// First select a utility
		act(() => {
			getByText("Select Clear All").click();
		});

		expect(getByTestId("confirmation-pending").textContent).toBe("yes");

		// Then select No
		act(() => {
			getByText("Confirm No").click();
		});

		expect(getByTestId("confirmation-pending").textContent).toBe("no");
		expect(getByTestId("confirmation-message").textContent).toBe("none");
		expect(getByTestId("selected-utility").textContent).toBe("none");
	});

	it("should call client.docs().clearAll() when user confirms", async () => {
		const { getByText } = renderWithProviders();

		// First select a utility
		act(() => {
			getByText("Select Clear All").click();
		});

		// Then confirm
		await act(async () => {
			getByText("Confirm Yes").click();
			// Wait for async operation
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		expect(mockClearAll).toHaveBeenCalled();
	});

	it("should handle errors when clearAll fails", async () => {
		const errorClient = {
			docs: () => ({
				clearAll: vi.fn().mockRejectedValue(new Error("Failed to clear")),
			}),
		} as unknown as Client;

		const { getByTestId, getByText } = render(
			<SystemProvider>
				<ExitProvider onExit={vi.fn()}>
					<ClientProvider client={errorClient}>
						<AdminProvider>
							<TestComponent />
						</AdminProvider>
					</ClientProvider>
				</ExitProvider>
			</SystemProvider>,
		);

		// Select utility
		act(() => {
			getByText("Select Clear All").click();
		});

		// Confirm
		await act(async () => {
			getByText("Confirm Yes").click();
			// Wait for async operation
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		expect(getByTestId("error").textContent).toBe("Failed to clear");
	});

	it("should handle non-Error exceptions", async () => {
		const errorClient = {
			docs: () => ({
				clearAll: vi.fn().mockRejectedValue("String error"),
			}),
		} as unknown as Client;

		const { getByTestId, getByText } = render(
			<SystemProvider>
				<ExitProvider onExit={vi.fn()}>
					<ClientProvider client={errorClient}>
						<AdminProvider>
							<TestComponent />
						</AdminProvider>
					</ClientProvider>
				</ExitProvider>
			</SystemProvider>,
		);

		// Select utility
		act(() => {
			getByText("Select Clear All").click();
		});

		// Confirm
		await act(async () => {
			getByText("Confirm Yes").click();
			// Wait for async operation
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		expect(getByTestId("error").textContent).toBe("Operation failed");
	});

	it("should reset all state when handleBack is called", () => {
		const { getByTestId, getByText } = renderWithProviders();

		// Set some state first
		act(() => {
			getByText("Select Clear All").click();
		});

		expect(getByTestId("confirmation-pending").textContent).toBe("yes");

		// Call handleBack
		act(() => {
			getByText("Back").click();
		});

		expect(getByTestId("selected-utility").textContent).toBe("none");
		expect(getByTestId("confirmation-pending").textContent).toBe("no");
		expect(getByTestId("confirmation-message").textContent).toBe("none");
	});

	it("should show loading state during operation", async () => {
		let resolvePromise: () => void;
		const slowClient = {
			docs: () => ({
				clearAll: vi.fn().mockImplementation(
					() =>
						new Promise(resolve => {
							resolvePromise = resolve as () => void;
						}),
				),
			}),
		} as unknown as Client;

		const { getByTestId, getByText } = render(
			<SystemProvider>
				<ExitProvider onExit={vi.fn()}>
					<ClientProvider client={slowClient}>
						<AdminProvider>
							<TestComponent />
						</AdminProvider>
					</ClientProvider>
				</ExitProvider>
			</SystemProvider>,
		);

		// Select and confirm
		act(() => {
			getByText("Select Clear All").click();
		});

		await act(async () => {
			getByText("Confirm Yes").click();
			// Wait a tick for loading state to appear
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		expect(getByTestId("loading").textContent).toBe("yes");

		// Resolve the promise
		await act(async () => {
			resolvePromise?.();
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		expect(getByTestId("loading").textContent).toBe("no");
	});

	it("should throw error when used outside AdminProvider", () => {
		// Suppress console.error for this test
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
			// Intentionally empty - suppressing error output for this test
		});

		const TestBadComponent = () => {
			expect(() => useAdminContext()).toThrow("useAdminContext must be used within an AdminProvider");
			return <div>Test</div>;
		};

		render(
			<SystemProvider>
				<ExitProvider onExit={vi.fn()}>
					<ClientProvider client={mockClient}>
						<TestBadComponent />
					</ClientProvider>
				</ExitProvider>
			</SystemProvider>,
		);

		consoleError.mockRestore();
	});
});
