import { useVersionHistory, useVersionHistoryOptional, VersionHistoryProvider } from "./VersionHistoryContext";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

describe("VersionHistoryContext", () => {
	describe("useVersionHistory", () => {
		it("should provide onVersionRestored callback to children", () => {
			const mockOnVersionRestored = vi.fn();
			let contextValue: ReturnType<typeof useVersionHistory> | undefined;

			function TestComponent() {
				contextValue = useVersionHistory();
				return <button onClick={contextValue.onVersionRestored}>Restore</button>;
			}

			render(
				<VersionHistoryProvider onVersionRestored={mockOnVersionRestored}>
					<TestComponent />
				</VersionHistoryProvider>,
			);

			expect(contextValue).toBeDefined();
			expect(contextValue?.onVersionRestored).toBe(mockOnVersionRestored);

			fireEvent.click(screen.getByText("Restore"));
			expect(mockOnVersionRestored).toHaveBeenCalledTimes(1);
		});

		it("should throw error when useVersionHistory is used outside provider", () => {
			function TestComponent() {
				useVersionHistory();
				return <div>Test</div>;
			}

			expect(() => {
				render(<TestComponent />);
			}).toThrow("useVersionHistory must be used within a VersionHistoryProvider");
		});
	});

	describe("useVersionHistoryOptional", () => {
		it("should return context value when within provider", () => {
			const mockOnVersionRestored = vi.fn();
			let contextValue: ReturnType<typeof useVersionHistoryOptional>;

			function TestComponent() {
				contextValue = useVersionHistoryOptional();
				return <div>Test</div>;
			}

			render(
				<VersionHistoryProvider onVersionRestored={mockOnVersionRestored}>
					<TestComponent />
				</VersionHistoryProvider>,
			);

			expect(contextValue).toBeDefined();
			expect(contextValue?.onVersionRestored).toBe(mockOnVersionRestored);
		});

		it("should return undefined when outside provider", () => {
			let contextValue: ReturnType<typeof useVersionHistoryOptional>;

			function TestComponent() {
				contextValue = useVersionHistoryOptional();
				return <div>Test</div>;
			}

			render(<TestComponent />);

			expect(contextValue).toBeUndefined();
		});
	});
});
