import { usePreference, usePreferenceSetter, usePreferenceValue } from "../hooks/usePreference";
import { ClientProvider } from "./ClientContext";
import { OrgProvider, useOrg } from "./OrgContext";
import { PREFERENCES, PreferencesProvider, usePreferencesService } from "./PreferencesContext";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
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

describe("PreferencesContext", () => {
	beforeEach(() => {
		localStorage.clear();
		mockGetCurrent.mockResolvedValue({
			tenant: null,
			org: null,
			availableOrgs: [],
		});
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	function TestWrapper({ children }: { children: ReactElement }): ReactElement {
		return (
			<ClientProvider client={mockClient}>
				<OrgProvider>
					<PreferencesProvider>{children}</PreferencesProvider>
				</OrgProvider>
			</ClientProvider>
		);
	}

	it("should provide preferences service", async () => {
		function TestComponent(): ReactElement {
			const service = usePreferencesService();
			return <div data-testid="has-service">{service ? "yes" : "no"}</div>;
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("has-service").textContent).toBe("yes");
		});
	});

	it("should throw error when usePreferencesService is used outside provider", () => {
		function TestComponent(): ReactElement {
			usePreferencesService();
			return <div>Test</div>;
		}

		expect(() => render(<TestComponent />)).toThrow(
			"usePreferencesService must be used within a PreferencesProvider",
		);
	});

	it("should get default preference values", async () => {
		function TestComponent(): ReactElement {
			const service = usePreferencesService();
			const theme = service.get(PREFERENCES.theme);
			return <div data-testid="theme">{theme}</div>;
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("theme").textContent).toBe("light");
		});
	});

	it("should get and set preference values", async () => {
		function TestComponent(): ReactElement {
			const service = usePreferencesService();
			const theme = service.get(PREFERENCES.theme);

			return (
				<div>
					<div data-testid="theme">{theme}</div>
					<button
						onClick={() => {
							service.set(PREFERENCES.theme, "dark");
						}}
					>
						Set Dark
					</button>
				</div>
			);
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("theme").textContent).toBe("light");
		});

		fireEvent.click(screen.getByText("Set Dark"));

		// The value in localStorage should be updated
		expect(localStorage.getItem("theme")).toBe("dark");
	});
});

describe("usePreference hook", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	function TestWrapper({ children }: { children: ReactElement }): ReactElement {
		return (
			<ClientProvider client={mockClient}>
				<OrgProvider>
					<PreferencesProvider>{children}</PreferencesProvider>
				</OrgProvider>
			</ClientProvider>
		);
	}

	it("should return current value and setter", async () => {
		function TestComponent(): ReactElement {
			const [theme, setTheme] = usePreference(PREFERENCES.theme);

			return (
				<div>
					<div data-testid="theme">{theme}</div>
					<button onClick={() => setTheme("dark")}>Toggle</button>
				</div>
			);
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("theme").textContent).toBe("light");
		});

		fireEvent.click(screen.getByText("Toggle"));

		await waitFor(() => {
			expect(screen.getByTestId("theme").textContent).toBe("dark");
		});
	});

	it("should read existing localStorage value", async () => {
		localStorage.setItem("theme", "dark");

		function TestComponent(): ReactElement {
			const [theme] = usePreference(PREFERENCES.theme);
			return <div data-testid="theme">{theme}</div>;
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("theme").textContent).toBe("dark");
		});
	});
});

describe("usePreferenceValue hook", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	function TestWrapper({ children }: { children: ReactElement }): ReactElement {
		return (
			<ClientProvider client={mockClient}>
				<OrgProvider>
					<PreferencesProvider>{children}</PreferencesProvider>
				</OrgProvider>
			</ClientProvider>
		);
	}

	it("should return preference value", async () => {
		localStorage.setItem("sidebarCollapsed", "true");

		function TestComponent(): ReactElement {
			const collapsed = usePreferenceValue(PREFERENCES.sidebarCollapsed);
			return <div data-testid="collapsed">{collapsed ? "yes" : "no"}</div>;
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("collapsed").textContent).toBe("yes");
		});
	});
});

describe("usePreferenceSetter hook", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	function TestWrapper({ children }: { children: ReactElement }): ReactElement {
		return (
			<ClientProvider client={mockClient}>
				<OrgProvider>
					<PreferencesProvider>{children}</PreferencesProvider>
				</OrgProvider>
			</ClientProvider>
		);
	}

	it("should provide setter function", () => {
		function TestComponent(): ReactElement {
			const setChatWidth = usePreferenceSetter(PREFERENCES.chatWidth);

			return (
				<div>
					<button onClick={() => setChatWidth(750)}>Set Width</button>
				</div>
			);
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		fireEvent.click(screen.getByText("Set Width"));

		expect(localStorage.getItem("chatWidth")).toBe("750");
	});
});

describe("Multi-tenant mode", () => {
	beforeEach(() => {
		localStorage.clear();
		mockGetCurrent.mockResolvedValue({
			tenant: { id: "tenant-1", slug: "acme", displayName: "ACME Corp" },
			org: { id: "org-1", slug: "engineering", displayName: "Engineering", schemaName: "org_eng" },
			availableOrgs: [],
		});
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	function TestWrapper({ children }: { children: ReactElement }): ReactElement {
		return (
			<ClientProvider client={mockClient}>
				<OrgProvider>
					<PreferencesProvider>{children}</PreferencesProvider>
				</OrgProvider>
			</ClientProvider>
		);
	}

	it("should use tenant-prefixed keys in multi-tenant mode", async () => {
		function TestComponent(): ReactElement {
			const { isMultiTenant } = useOrg();
			const [theme, setTheme] = usePreference(PREFERENCES.theme);

			return (
				<div>
					<div data-testid="theme">{theme}</div>
					<div data-testid="multi-tenant">{isMultiTenant ? "yes" : "no"}</div>
					<button onClick={() => setTheme("dark")}>Set Dark</button>
				</div>
			);
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		// Wait for org context to load and multi-tenant mode to be active
		await waitFor(() => {
			expect(screen.getByTestId("multi-tenant").textContent).toBe("yes");
		});

		fireEvent.click(screen.getByText("Set Dark"));

		// In multi-tenant mode, should use prefixed key
		await waitFor(() => {
			expect(localStorage.getItem("jolli:acme:theme")).toBe("dark");
		});
	});

	it("should use tenant-org-prefixed keys for tenant-org scope", async () => {
		function TestComponent(): ReactElement {
			const { isMultiTenant } = useOrg();
			const [filter, setFilter] = usePreference(PREFERENCES.articlesDraftFilter);

			return (
				<div>
					<div data-testid="filter">{filter}</div>
					<div data-testid="multi-tenant">{isMultiTenant ? "yes" : "no"}</div>
					<button onClick={() => setFilter("my-new-drafts")}>Set Filter</button>
				</div>
			);
		}

		render(
			<TestWrapper>
				<TestComponent />
			</TestWrapper>,
		);

		// Wait for org context to load and multi-tenant mode to be active
		await waitFor(() => {
			expect(screen.getByTestId("multi-tenant").textContent).toBe("yes");
		});

		fireEvent.click(screen.getByText("Set Filter"));

		// In multi-tenant mode, tenant-org scope should include both slugs
		await waitFor(() => {
			expect(localStorage.getItem("jolli:acme:engineering:articles.draftFilter")).toBe("my-new-drafts");
		});
	});
});
