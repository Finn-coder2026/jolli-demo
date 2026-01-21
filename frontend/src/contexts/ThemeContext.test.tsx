import { ClientProvider } from "./ClientContext";
import { OrgProvider } from "./OrgContext";
import { PreferencesProvider } from "./PreferencesContext";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { render, screen } from "@testing-library/preact";
import type { Client } from "jolli-common";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the client
const mockGetCurrent = vi.fn().mockResolvedValue({
	tenant: null,
	org: null,
	availableOrgs: [],
});

const mockClient = {
	orgs: () => ({
		getCurrent: mockGetCurrent,
	}),
} as unknown as Client;

/**
 * Wrapper that provides all required contexts for ThemeProvider.
 */
function TestWrapper({ children }: { children: ReactElement }): ReactElement {
	return (
		<ClientProvider client={mockClient}>
			<OrgProvider>
				<PreferencesProvider>{children}</PreferencesProvider>
			</OrgProvider>
		</ClientProvider>
	);
}

describe("ThemeContext", () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.classList.remove("dark");
	});

	afterEach(() => {
		localStorage.clear();
		document.documentElement.classList.remove("dark");
		vi.restoreAllMocks();
	});

	it("should provide theme context", () => {
		function TestComponent(): ReactElement {
			const { isDarkMode } = useTheme();
			return <div>{isDarkMode ? "Dark" : "Light"}</div>;
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		expect(screen.getByText("Light")).toBeDefined();
	});

	it("should load saved theme from localStorage", () => {
		localStorage.setItem("theme", "dark");

		function TestComponent(): ReactElement {
			const { isDarkMode } = useTheme();
			return <div>{isDarkMode ? "Dark" : "Light"}</div>;
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		expect(screen.getByText("Dark")).toBeDefined();
	});

	it("should use system preference when no saved theme", () => {
		// matchMedia mock returns false by default (light mode)
		function TestComponent(): ReactElement {
			const { isDarkMode } = useTheme();
			return <div>{isDarkMode ? "Dark" : "Light"}</div>;
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		expect(screen.getByText("Light")).toBeDefined();
	});

	it("should throw error when useTheme is used outside ThemeProvider", () => {
		function TestComponent(): ReactElement {
			useTheme();
			return <div>Test</div>;
		}

		expect(() => render(<TestComponent />)).toThrow("useTheme must be used within a ThemeProvider");
	});

	it("should provide toggleTheme function", () => {
		function TestComponent(): ReactElement {
			const { toggleTheme } = useTheme();
			return <button onClick={toggleTheme}>Toggle</button>;
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		expect(screen.getByText("Toggle")).toBeDefined();
	});

	it("should have toggle function available", () => {
		function TestComponent(): ReactElement {
			const { isDarkMode, toggleTheme } = useTheme();
			return (
				<div>
					<div data-testid="theme">{isDarkMode ? "dark" : "light"}</div>
					<button onClick={toggleTheme}>Toggle</button>
				</div>
			);
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		const button = screen.getByText("Toggle");
		const theme = screen.getByTestId("theme");

		expect(theme.textContent).toBe("light");
		expect(button).toBeDefined();
	});

	it("should call toggleTheme function", () => {
		let capturedToggle: (() => void) | undefined;

		function TestComponent(): ReactElement {
			const { toggleTheme } = useTheme();
			capturedToggle = toggleTheme;
			return <div>Test</div>;
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Call the toggle function directly to cover the toggleTheme function
		expect(capturedToggle).toBeDefined();
		// @ts-expect-error - calling captured function for coverage
		capturedToggle();
	});
});
