/**
 * @vitest-environment jsdom
 */
import { SystemContext, SystemProvider, useSystemContext } from "./SystemContext";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("SystemContext", () => {
	describe("useSystemContext", () => {
		it("should throw error when used outside SystemProvider", () => {
			const TestComponent = () => {
				expect(() => useSystemContext()).toThrow("useSystemContext must be used within a SystemProvider");
				return <div>Test</div>;
			};

			render(<TestComponent />);
		});

		it("should return context value when used inside SystemProvider via Context.Provider", () => {
			const TestComponent = () => {
				const context = useSystemContext();
				expect(context).toBeDefined();
				expect(context.systemMessage).toBe("Test message");
				expect(context.viewMode).toBe("test-mode");
				expect(context.setSystemMessage).toBeDefined();
				expect(context.setViewMode).toBeDefined();
				return <div>Test</div>;
			};

			render(
				<SystemContext.Provider
					value={{
						systemMessage: "Test message",
						setSystemMessage: vi.fn(),
						viewMode: "test-mode",
						setViewMode: vi.fn(),
					}}
				>
					<TestComponent />
				</SystemContext.Provider>,
			);
		});

		it("should initialize with default values when using SystemProvider", () => {
			const TestComponent = () => {
				const { systemMessage, viewMode } = useSystemContext();
				expect(systemMessage).toBeNull();
				expect(viewMode).toBe("chat");
				return <div>Test</div>;
			};

			render(
				<SystemProvider>
					<TestComponent />
				</SystemProvider>,
			);
		});

		it("should provide setSystemMessage and setViewMode functions", () => {
			const TestComponent = () => {
				const { setSystemMessage, setViewMode } = useSystemContext();
				expect(setSystemMessage).toBeDefined();
				expect(typeof setSystemMessage).toBe("function");
				expect(setViewMode).toBeDefined();
				expect(typeof setViewMode).toBe("function");
				return <div>Test</div>;
			};

			render(
				<SystemProvider>
					<TestComponent />
				</SystemProvider>,
			);
		});
	});
});
