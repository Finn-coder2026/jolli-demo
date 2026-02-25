import { ClientProvider } from "../contexts/ClientContext";
import { OrgProvider, useOrg } from "../contexts/OrgContext";
import { TenantProvider } from "../contexts/TenantContext";
import { OrgSwitcher } from "./OrgSwitcher";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { CurrentOrgResponse, OrgSummary } from "jolli-common";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTenant = {
	id: "tenant-123",
	slug: "test-tenant",
	displayName: "Test Tenant",
};

const mockOrg = {
	id: "org-1",
	slug: "engineering",
	displayName: "Engineering",
	schemaName: "org_engineering",
};

const mockAvailableOrgs: Array<OrgSummary> = [
	{
		id: "org-1",
		tenantId: "tenant-123",
		slug: "engineering",
		displayName: "Engineering",
		schemaName: "org_engineering",
		status: "active",
		isDefault: true,
		createdAt: new Date("2024-01-01"),
	},
	{
		id: "org-2",
		tenantId: "tenant-123",
		slug: "marketing",
		displayName: "Marketing",
		schemaName: "org_marketing",
		status: "active",
		isDefault: false,
		createdAt: new Date("2024-01-01"),
	},
	{
		id: "org-3",
		tenantId: "tenant-123",
		slug: "sales",
		displayName: "Sales",
		schemaName: "org_sales",
		status: "active",
		isDefault: false,
		createdAt: new Date("2024-01-01"),
	},
];

const mockCurrentOrgResponse: CurrentOrgResponse = {
	tenant: mockTenant,
	org: mockOrg,
	availableOrgs: mockAvailableOrgs,
	favoritesHash: "EMPTY",
};

const mockOrgClient = {
	getCurrent: vi.fn().mockResolvedValue(mockCurrentOrgResponse),
	listOrgs: vi.fn().mockResolvedValue({ orgs: mockAvailableOrgs }),
};

const mockSelectTenant = vi.fn().mockResolvedValue({
	success: true,
	url: "http://localhost:8034/?_t=123",
});

const mockAuthClient = {
	selectTenant: mockSelectTenant,
	getCliToken: vi.fn(),
	setAuthToken: vi.fn(),
	getSessionConfig: vi.fn(),
};

const mockTenantClient = {
	listTenants: vi.fn().mockResolvedValue({
		useTenantSwitcher: false,
		currentTenantId: "tenant-123",
		baseDomain: "jolli.app",
		tenants: [],
	}),
};

const mockClient = {
	orgs: vi.fn(() => mockOrgClient),
	auth: vi.fn(() => mockAuthClient),
	tenants: vi.fn(() => mockTenantClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

// Mock window.location
const originalLocation = window.location;
let mockLocationHref = "http://localhost:8034/";

beforeEach(() => {
	vi.clearAllMocks();
	mockOrgClient.getCurrent.mockResolvedValue(mockCurrentOrgResponse);
	mockTenantClient.listTenants.mockResolvedValue({
		useTenantSwitcher: false,
		currentTenantId: "tenant-123",
		baseDomain: "jolli.app",
		tenants: [],
	});
	mockSelectTenant.mockResolvedValue({
		success: true,
		url: "http://localhost:8034/?_t=123",
	});
	sessionStorage.clear();
	mockLocationHref = "http://localhost:8034/";

	// Mock window.location with href setter
	delete (window as unknown as { location: unknown }).location;
	(window as unknown as { location: Partial<Location> }).location = {
		...originalLocation,
		get href() {
			return mockLocationHref;
		},
		set href(value: string) {
			mockLocationHref = value;
		},
	};
});

afterEach(() => {
	// Restore window.location
	Object.defineProperty(window, "location", {
		value: originalLocation,
		writable: true,
		configurable: true,
	});
});

function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
	return render(
		<ClientProvider client={mockClient as unknown as import("jolli-common").Client}>
			<TenantProvider>
				<OrgProvider>{ui}</OrgProvider>
			</TenantProvider>
		</ClientProvider>,
	);
}

describe("OrgSwitcher", () => {
	it("should render the current org name", async () => {
		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByText("Engineering")).toBeDefined();
		});
	});

	it("should show the trigger button with test id", async () => {
		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});
	});

	it("should open dropdown and show available orgs when clicked", async () => {
		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Test Tenant")).toBeDefined();
			expect(screen.getByText("Marketing")).toBeDefined();
			expect(screen.getByText("Sales")).toBeDefined();
		});
	});

	it("should switch org when clicking on a different org", async () => {
		// Mock selectTenant to return same URL as current (triggers navigation with timestamp)
		mockSelectTenant.mockResolvedValue({ success: true, url: "http://localhost:8034" });

		const hrefSpy = vi.fn();
		Object.defineProperty(window.location, "href", {
			set: hrefSpy,
			get: () => "http://localhost:8034",
			configurable: true,
		});

		renderWithProviders(<OrgSwitcher />);

		// Wait for both org context and tenant context to load
		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
			expect(screen.getByText("Engineering")).toBeDefined();
		});

		// Wait a bit more to ensure tenant context has fully loaded
		await waitFor(() => {
			expect(mockTenantClient.listTenants).toHaveBeenCalled();
		});

		// Click trigger to open dropdown
		const trigger = screen.getByTestId("org-switcher-trigger");
		fireEvent.click(trigger);

		// Wait for dropdown to appear
		await waitFor(() => {
			expect(screen.getByText("Marketing")).toBeDefined();
		});

		// Click Marketing
		const marketing = screen.getByText("Marketing");
		fireEvent.click(marketing);

		// Should store selected org in session storage
		await waitFor(() => {
			expect(sessionStorage.getItem("selectedOrgSlug")).toBe("marketing");
		});

		// Should call selectTenant with tenant and new org
		await waitFor(() => {
			expect(mockSelectTenant).toHaveBeenCalledWith("tenant-123", "org-2");
		});

		// Should navigate with timestamp since URL is same
		await waitFor(() => {
			expect(hrefSpy).toHaveBeenCalled();
			const calledUrl = hrefSpy.mock.calls[0][0];
			expect(calledUrl).toContain("http://localhost:8034");
			expect(calledUrl).toContain("_t="); // Should have timestamp parameter
		});
	});

	it("should not switch when clicking on the current org", async () => {
		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		// Click on Engineering (current org)
		await waitFor(() => {
			// Find the dropdown item containing "Engineering"
			const engineeringItems = screen.getAllByText("Engineering");
			// The second one is in the dropdown
			expect(engineeringItems.length).toBeGreaterThanOrEqual(1);
		});

		// Click on the Engineering option in dropdown
		const engineeringItems = screen.getAllByText("Engineering");
		// Click the one that's not in the trigger
		fireEvent.click(engineeringItems[engineeringItems.length > 1 ? 1 : 0]);

		// Wait a bit to ensure no async operations occur
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should not call selectTenant for current org
		expect(mockSelectTenant).not.toHaveBeenCalled();
		// Should not set session storage
		expect(sessionStorage.getItem("selectedOrgSlug")).toBeNull();
	});

	it("should render in compact mode without org name", async () => {
		const { container } = renderWithProviders(<OrgSwitcher compact />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		// In compact mode, the org name should not be visible in the trigger
		const trigger = screen.getByTestId("org-switcher-trigger");
		expect(trigger.textContent).not.toContain("Engineering");

		// But the icon should be present
		const icon = container.querySelector("svg");
		expect(icon).toBeDefined();
	});

	it("should apply custom className", async () => {
		renderWithProviders(<OrgSwitcher className="custom-class" />);

		await waitFor(() => {
			const trigger = screen.getByTestId("org-switcher-trigger");
			expect(trigger.className).toContain("custom-class");
		});
	});

	it("should not render when not in multi-tenant mode", async () => {
		mockOrgClient.getCurrent.mockResolvedValue({
			tenant: null,
			org: null,
			availableOrgs: [],
		});

		const { container } = renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			// Give it time to load
			expect(mockOrgClient.getCurrent).toHaveBeenCalled();
		});

		// Wait a bit more to ensure loading completes
		await new Promise(resolve => setTimeout(resolve, 50));

		// The component should render nothing
		expect(container.innerHTML).toBe("");
	});

	it("should not render when no orgs available", async () => {
		mockOrgClient.getCurrent.mockResolvedValue({
			tenant: mockTenant,
			org: mockOrg,
			availableOrgs: [],
		});

		const { container } = renderWithProviders(<OrgSwitcher />);

		// Wait for loading to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Component should not render when there are no orgs
		expect(container.innerHTML).toBe("");
	});

	it("should not render when only single org available", async () => {
		mockOrgClient.getCurrent.mockResolvedValue({
			tenant: mockTenant,
			org: mockOrg,
			availableOrgs: [mockAvailableOrgs[0]], // Only one org
		});

		const { container } = renderWithProviders(<OrgSwitcher />);

		// Wait for loading to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Component should not render when there's only one org
		expect(container.innerHTML).toBe("");
	});

	it("should show check mark next to current org", async () => {
		const { container } = renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		await waitFor(() => {
			// Use getAllByText since Engineering appears in trigger and dropdown
			const engineeringItems = screen.getAllByText("Engineering");
			expect(engineeringItems.length).toBeGreaterThanOrEqual(1);
		});

		// The check mark should be visible next to the current org
		// Look for SVG icons - there should be multiple (Building2, ChevronDown, Check icons)
		const svgIcons = container.querySelectorAll("svg");
		// At minimum we should have Building2, ChevronDown from trigger, plus Check from current org
		expect(svgIcons.length).toBeGreaterThanOrEqual(3);
	});

	it("should not render while loading", async () => {
		// Create a component that checks the loading state
		let isLoadingValue: boolean | undefined;

		function TestComponent(): ReactElement | null {
			const { isLoading } = useOrg();
			isLoadingValue = isLoading;
			return <OrgSwitcher />;
		}

		const { container } = renderWithProviders(<TestComponent />);

		// Initially should be loading
		expect(isLoadingValue).toBe(true);
		expect(container.querySelector("[data-testid='org-switcher-trigger']")).toBeNull();

		// After loading completes
		await waitFor(() => {
			expect(isLoadingValue).toBe(false);
		});
	});

	it("should not switch org when no current tenant is available", async () => {
		// Mock the tenant context to return no current tenant
		mockTenantClient.listTenants.mockResolvedValue({
			useTenantSwitcher: false,
			currentTenantId: null, // No current tenant
			baseDomain: "jolli.app",
			tenants: [],
		});

		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Intentionally suppress console.error for this test
		});

		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		// Wait for tenant context to fully load
		await waitFor(() => {
			expect(mockTenantClient.listTenants).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Marketing")).toBeDefined();
		});

		// Click on Marketing to try switching
		fireEvent.click(screen.getByText("Marketing"));

		// Wait a bit for the async operations
		await new Promise(resolve => setTimeout(resolve, 50));

		// Should log an error and NOT call selectTenant
		expect(consoleErrorSpy).toHaveBeenCalledWith("Cannot switch org: no current tenant");
		expect(mockSelectTenant).not.toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});

	it("should navigate to different URL when result URL differs from current", async () => {
		// Mock selectTenant to return a different URL
		mockSelectTenant.mockResolvedValue({
			success: true,
			url: "http://different-domain.com/dashboard",
		});

		const hrefSpy = vi.fn();
		Object.defineProperty(window.location, "href", {
			set: hrefSpy,
			get: () => "http://localhost:8034/current-page",
			configurable: true,
		});

		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		// Wait for tenant context to fully load
		await waitFor(() => {
			expect(mockTenantClient.listTenants).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Marketing")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Marketing"));

		// Should navigate directly to the different URL without timestamp
		await waitFor(() => {
			expect(hrefSpy).toHaveBeenCalledWith("http://different-domain.com/dashboard");
		});
	});

	it("should handle selectTenant error gracefully", async () => {
		mockSelectTenant.mockRejectedValue(new Error("Network error"));

		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Intentionally suppress console.error for this test
		});

		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		// Wait for tenant context to fully load
		await waitFor(() => {
			expect(mockTenantClient.listTenants).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Marketing")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Marketing"));

		// Should log the error
		await waitFor(() => {
			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to switch org:", expect.any(Error));
		});

		consoleErrorSpy.mockRestore();
	});

	it("should append timestamp with & when URL already has query params", async () => {
		// Mock selectTenant to return same URL base but with query params
		mockSelectTenant.mockResolvedValue({
			success: true,
			url: "http://localhost:8034?existing=param",
		});

		const hrefSpy = vi.fn();
		Object.defineProperty(window.location, "href", {
			set: hrefSpy,
			get: () => "http://localhost:8034",
			configurable: true,
		});

		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		// Wait for tenant context to fully load
		await waitFor(() => {
			expect(mockTenantClient.listTenants).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Marketing")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Marketing"));

		// Should navigate with & since URL already has query params
		await waitFor(() => {
			expect(hrefSpy).toHaveBeenCalled();
			const calledUrl = hrefSpy.mock.calls[0][0];
			expect(calledUrl).toContain("http://localhost:8034?existing=param&_t=");
		});
	});
});
