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

	it("should use system preference when no saved theme (light mode)", () => {
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

	it("should use system dark preference when no saved theme", () => {
		// Save original matchMedia
		const originalMatchMedia = window.matchMedia;

		// Mock matchMedia to return dark mode preference
		const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: query === "(prefers-color-scheme: dark)",
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));
		window.matchMedia = mockMatchMedia;

		try {
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

			// When system prefers dark and no saved theme, should use dark
			expect(screen.getByText("Dark")).toBeDefined();
		} finally {
			// Restore original matchMedia
			window.matchMedia = originalMatchMedia;
		}
	});

	it("should throw error when useTheme is used outside ThemeProvider", () => {
		function TestComponent(): ReactElement {
			useTheme();
			return <div>Test</div>;
		}

		expect(() => render(<TestComponent />)).toThrow("useTheme must be used within a ThemeProvider");
	});

	it("should provide setThemeMode function", () => {
		function TestComponent(): ReactElement {
			const { setThemeMode } = useTheme();
			return <button onClick={() => setThemeMode("dark")}>Set Dark</button>;
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		expect(screen.getByText("Set Dark")).toBeDefined();
	});

	it("should have setThemeMode function available", () => {
		function TestComponent(): ReactElement {
			const { isDarkMode, setThemeMode } = useTheme();
			return (
				<div>
					<div data-testid="theme">{isDarkMode ? "dark" : "light"}</div>
					<button onClick={() => setThemeMode("dark")}>Set Dark</button>
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

		const button = screen.getByText("Set Dark");
		const theme = screen.getByTestId("theme");

		expect(theme.textContent).toBe("light");
		expect(button).toBeDefined();
	});

	it("should call setThemeMode function", () => {
		let capturedSetThemeMode: ((mode: "system" | "light" | "dark") => void) | undefined;

		function TestComponent(): ReactElement {
			const { setThemeMode } = useTheme();
			capturedSetThemeMode = setThemeMode;
			return <div>Test</div>;
		}

		render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Call the setThemeMode function directly to cover the function
		expect(capturedSetThemeMode).toBeDefined();
		// biome-ignore lint/style/noNonNullAssertion: capturedSetThemeMode is defined in the test
		capturedSetThemeMode!("dark");
	});

	it("should switch from system to dark theme", () => {
		let capturedSetThemeMode: ((mode: "system" | "light" | "dark") => void) | undefined;
		let capturedIsDarkMode: boolean | undefined;

		function TestComponent(): ReactElement {
			const { isDarkMode, setThemeMode } = useTheme();
			capturedSetThemeMode = setThemeMode;
			capturedIsDarkMode = isDarkMode;
			return <div>{isDarkMode ? "Dark" : "Light"}</div>;
		}

		const { rerender } = render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Initially should be light mode (system default)
		expect(capturedIsDarkMode).toBe(false);

		// Set to dark mode
		// biome-ignore lint/style/noNonNullAssertion: capturedSetThemeMode is defined in the test
		capturedSetThemeMode!("dark");

		// Re-render to get updated state
		rerender(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Should be dark mode now
		expect(screen.getByText("Dark")).toBeDefined();
	});

	it("should switch from dark to light theme", () => {
		// Set dark mode initially
		localStorage.setItem("theme", "dark");

		let capturedSetThemeMode: ((mode: "system" | "light" | "dark") => void) | undefined;

		function TestComponent(): ReactElement {
			const { isDarkMode, setThemeMode } = useTheme();
			capturedSetThemeMode = setThemeMode;
			return <div>{isDarkMode ? "Dark" : "Light"}</div>;
		}

		const { rerender } = render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Initially should be dark mode
		expect(screen.getByText("Dark")).toBeDefined();

		// Set to light mode
		// biome-ignore lint/style/noNonNullAssertion: capturedSetThemeMode is defined in the test
		capturedSetThemeMode!("light");

		// Re-render to get updated state
		rerender(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Should be light mode now
		expect(screen.getByText("Light")).toBeDefined();
	});

	it("should use dark theme when system prefers dark mode and theme is system", () => {
		// Mock matchMedia to return dark mode preference
		const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
			matches: query === "(prefers-color-scheme: dark)",
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));

		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: matchMediaMock,
		});

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

	it("should listen for system theme changes when in system mode", () => {
		// Set initial state to light mode
		const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));

		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: matchMediaMock,
		});

		function TestComponent(): ReactElement {
			const { isDarkMode, themeMode } = useTheme();
			return (
				<div>
					<div data-testid="theme">{isDarkMode ? "Dark" : "Light"}</div>
					<div data-testid="mode">{themeMode}</div>
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

		expect(screen.getByTestId("theme").textContent).toBe("Light");
		expect(screen.getByTestId("mode").textContent).toBe("system");
	});

	it("should update theme when system preference changes", () => {
		// Capture the addEventListener callback using an object to avoid TypeScript control flow narrowing issues
		const handlerRef: { current: ((e: MediaQueryListEvent) => void) | null } = { current: null };

		const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
			matches: false, // Start with light mode
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn((_, handler: (e: MediaQueryListEvent) => void) => {
				handlerRef.current = handler;
			}),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));

		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: matchMediaMock,
		});

		function TestComponent(): ReactElement {
			const { isDarkMode } = useTheme();
			return <div data-testid="theme">{isDarkMode ? "Dark" : "Light"}</div>;
		}

		const { rerender } = render(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Initially should be light
		expect(screen.getByTestId("theme").textContent).toBe("Light");

		// Simulate system theme change to dark
		expect(handlerRef.current).not.toBeNull();
		handlerRef.current?.({ matches: true } as MediaQueryListEvent);

		// Re-render to see the state change
		rerender(
			<TestWrapper>
				<ThemeProvider>
					<TestComponent />
				</ThemeProvider>
			</TestWrapper>,
		);

		// Should now be dark
		expect(screen.getByTestId("theme").textContent).toBe("Dark");
	});
});
