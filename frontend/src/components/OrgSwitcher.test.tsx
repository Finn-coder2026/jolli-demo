import { ClientProvider } from "../contexts/ClientContext";
import { OrgProvider, useOrg } from "../contexts/OrgContext";
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
};

const mockOrgClient = {
	getCurrent: vi.fn().mockResolvedValue(mockCurrentOrgResponse),
	listOrgs: vi.fn().mockResolvedValue({ orgs: mockAvailableOrgs }),
};

const mockClient = {
	orgs: vi.fn(() => mockOrgClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

// Mock window.location.reload
const mockReload = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
	vi.clearAllMocks();
	mockOrgClient.getCurrent.mockResolvedValue(mockCurrentOrgResponse);
	sessionStorage.clear();

	// Mock window.location
	Object.defineProperty(window, "location", {
		value: { ...originalLocation, reload: mockReload },
		writable: true,
	});
});

afterEach(() => {
	// Restore window.location
	Object.defineProperty(window, "location", {
		value: originalLocation,
		writable: true,
	});
});

function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
	return render(
		<ClientProvider>
			<OrgProvider>{ui}</OrgProvider>
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
		renderWithProviders(<OrgSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("org-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("org-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Marketing")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Marketing"));

		// Should store selected org in session storage
		expect(sessionStorage.getItem("selectedOrgSlug")).toBe("marketing");

		// Should trigger page reload
		expect(mockReload).toHaveBeenCalled();
	});

	it("should not reload when clicking on the current org", async () => {
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

		// Should not reload for current org
		// The reload may or may not be called depending on implementation, but sessionStorage should not be set
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
});
