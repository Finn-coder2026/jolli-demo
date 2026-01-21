/**
 * @vitest-environment jsdom
 */
import { ExitProvider, useExitContext } from "./ExitContext";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("ExitContext", () => {
	describe("useExitContext", () => {
		it("should throw error when used outside ExitProvider", () => {
			const TestComponent = () => {
				expect(() => useExitContext()).toThrow("useExitContext must be used within an ExitProvider");
				return <div>Test</div>;
			};

			render(<TestComponent />);
		});

		it("should return context value when used inside ExitProvider", () => {
			const mockOnExit = vi.fn();

			const TestComponent = () => {
				const context = useExitContext();
				expect(context).toBeDefined();
				expect(context.shouldExit).toBe(false);
				expect(context.setShouldExit).toBeDefined();
				expect(typeof context.setShouldExit).toBe("function");
				expect(context.isMountedRef).toBeDefined();
				expect(context.isMountedRef.current).toBe(true);
				expect(context.abortControllerRef).toBeDefined();
				expect(context.abortControllerRef.current).toBeNull();
				return <div>Test</div>;
			};

			render(
				<ExitProvider onExit={mockOnExit}>
					<TestComponent />
				</ExitProvider>,
			);
		});

		it("should provide exit state from context", () => {
			const mockOnExit = vi.fn();

			const TestComponent = () => {
				const { shouldExit, setShouldExit } = useExitContext();
				expect(shouldExit).toBe(false);
				expect(typeof setShouldExit).toBe("function");
				return <div>Test</div>;
			};

			render(
				<ExitProvider onExit={mockOnExit}>
					<TestComponent />
				</ExitProvider>,
			);
		});

		it("should provide refs from context", () => {
			const mockOnExit = vi.fn();

			const TestComponent = () => {
				const { isMountedRef, abortControllerRef } = useExitContext();
				expect(isMountedRef.current).toBe(true);
				expect(abortControllerRef.current).toBeNull();
				return <div>Test</div>;
			};

			render(
				<ExitProvider onExit={mockOnExit}>
					<TestComponent />
				</ExitProvider>,
			);
		});
	});
});
