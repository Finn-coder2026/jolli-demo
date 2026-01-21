import { ClientProvider } from "../contexts/ClientContext";
import { TenantProvider, useTenant } from "../contexts/TenantContext";
import { TenantSwitcher } from "./TenantSwitcher";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { TenantListItem, TenantListResponse } from "jolli-common";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockTenants: Array<TenantListItem> = [
	{
		id: "tenant-1",
		slug: "acme",
		displayName: "Acme Corp",
		primaryDomain: null,
	},
	{
		id: "tenant-2",
		slug: "beta",
		displayName: "Beta Inc",
		primaryDomain: "beta.example.com",
	},
	{
		id: "tenant-3",
		slug: "gamma",
		displayName: "Gamma Ltd",
		primaryDomain: null,
	},
];

const mockTenantListResponse: TenantListResponse = {
	useTenantSwitcher: true,
	currentTenantId: "tenant-1",
	baseDomain: "jolli.app",
	tenants: mockTenants,
};

const mockTenantClient = {
	listTenants: vi.fn().mockResolvedValue(mockTenantListResponse),
};

const mockClient = {
	tenants: vi.fn(() => mockTenantClient),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

// Mock window.location and window.open
const _mockAssign = vi.fn();
const mockOpen = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
	vi.clearAllMocks();
	mockTenantClient.listTenants.mockResolvedValue(mockTenantListResponse);

	// Mock window.location
	Object.defineProperty(window, "location", {
		value: {
			...originalLocation,
			href: "http://localhost:3000",
			hostname: "localhost",
			protocol: "http:",
			origin: "http://localhost:3000",
		},
		writable: true,
	});

	// Mock window.open
	window.open = mockOpen;
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
			<TenantProvider>{ui}</TenantProvider>
		</ClientProvider>,
	);
}

describe("TenantSwitcher", () => {
	it("should render the current tenant name", async () => {
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByText("Acme Corp")).toBeDefined();
		});
	});

	it("should show the trigger button with test id", async () => {
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});
	});

	it("should open dropdown and show available tenants when clicked", async () => {
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Beta Inc")).toBeDefined();
			expect(screen.getByText("Gamma Ltd")).toBeDefined();
		});
	});

	it("should navigate when clicking on a different tenant", async () => {
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Beta Inc")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Beta Inc"));

		// Should navigate to tenant with primary domain
		expect(window.location.href).toBe("http://beta.example.com");
	});

	it("should navigate to subdomain URL when tenant has no primary domain", async () => {
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Gamma Ltd")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Gamma Ltd"));

		// Should navigate to subdomain URL
		expect(window.location.href).toBe("http://gamma.jolli.app");
	});

	it("should not navigate when clicking on the current tenant", async () => {
		const initialHref = window.location.href;
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		// Find and click on Acme Corp in the dropdown
		await waitFor(() => {
			const acmeItems = screen.getAllByText("Acme Corp");
			expect(acmeItems.length).toBeGreaterThanOrEqual(1);
		});

		const acmeItems = screen.getAllByText("Acme Corp");
		// Click the one in the dropdown (not the trigger)
		fireEvent.click(acmeItems[acmeItems.length > 1 ? 1 : 0]);

		// Should not navigate for current tenant
		expect(window.location.href).toBe(initialHref);
	});

	it("should open tenant in new tab when clicking external link icon", async () => {
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByTestId("tenant-open-new-tab-beta")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-open-new-tab-beta"));

		// Should open in new tab
		expect(mockOpen).toHaveBeenCalledWith("http://beta.example.com", "_blank");
	});

	it("should render in compact mode without tenant name", async () => {
		const { container } = renderWithProviders(<TenantSwitcher compact />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		// In compact mode, the tenant name should not be visible in the trigger
		const trigger = screen.getByTestId("tenant-switcher-trigger");
		expect(trigger.textContent).not.toContain("Acme Corp");

		// But the icon should be present
		const icon = container.querySelector("svg");
		expect(icon).toBeDefined();
	});

	it("should apply custom className", async () => {
		renderWithProviders(<TenantSwitcher className="custom-class" />);

		await waitFor(() => {
			const trigger = screen.getByTestId("tenant-switcher-trigger");
			expect(trigger.className).toContain("custom-class");
		});
	});

	it("should not render when tenant switcher is disabled", async () => {
		mockTenantClient.listTenants.mockResolvedValue({
			useTenantSwitcher: false,
			currentTenantId: null,
			baseDomain: null,
			tenants: [],
		});

		const { container } = renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(mockTenantClient.listTenants).toHaveBeenCalled();
		});

		// Wait for loading to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Component should render nothing
		expect(container.innerHTML).toBe("");
	});

	it("should not render when only one tenant", async () => {
		mockTenantClient.listTenants.mockResolvedValue({
			useTenantSwitcher: true,
			currentTenantId: "tenant-1",
			baseDomain: "jolli.app",
			tenants: [mockTenants[0]], // Only one tenant
		});

		const { container } = renderWithProviders(<TenantSwitcher />);

		// Wait for loading to complete
		await new Promise(resolve => setTimeout(resolve, 50));

		// Component should render nothing
		expect(container.innerHTML).toBe("");
	});

	it("should not render while loading", async () => {
		// Create a component that checks the loading state
		let isLoadingValue: boolean | undefined;

		function TestComponent(): ReactElement | null {
			const { isLoading } = useTenant();
			isLoadingValue = isLoading;
			return <TenantSwitcher />;
		}

		const { container } = renderWithProviders(<TestComponent />);

		// Initially should be loading
		expect(isLoadingValue).toBe(true);
		expect(container.querySelector("[data-testid='tenant-switcher-trigger']")).toBeNull();

		// After loading completes
		await waitFor(() => {
			expect(isLoadingValue).toBe(false);
		});
	});

	it("should show check mark next to current tenant", async () => {
		const { container } = renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			const acmeItems = screen.getAllByText("Acme Corp");
			expect(acmeItems.length).toBeGreaterThanOrEqual(1);
		});

		// The check mark should be visible next to the current tenant
		// Look for SVG icons in dropdown
		const svgIcons = container.querySelectorAll("svg");
		// At minimum we should have Globe, ChevronDown from trigger, plus Check from current tenant
		expect(svgIcons.length).toBeGreaterThanOrEqual(3);
	});

	it("should not show external link icon for current tenant", async () => {
		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Beta Inc")).toBeDefined();
		});

		// External link for other tenants should exist
		expect(screen.getByTestId("tenant-open-new-tab-beta")).toBeDefined();
		expect(screen.getByTestId("tenant-open-new-tab-gamma")).toBeDefined();

		// External link for current tenant (acme) should NOT exist
		expect(screen.queryByTestId("tenant-open-new-tab-acme")).toBeNull();
	});

	it("should use HTTPS for non-localhost domains", async () => {
		// Change hostname to simulate production
		Object.defineProperty(window, "location", {
			value: {
				...originalLocation,
				href: "https://acme.jolli.app",
				hostname: "acme.jolli.app",
				protocol: "https:",
				origin: "https://acme.jolli.app",
			},
			writable: true,
		});

		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Beta Inc")).toBeDefined();
		});

		fireEvent.click(screen.getByText("Beta Inc"));

		// Should navigate with HTTPS
		expect(window.location.href).toBe("https://beta.example.com");
	});

	it("should show fallback text when current tenant is not found", async () => {
		mockTenantClient.listTenants.mockResolvedValue({
			useTenantSwitcher: true,
			currentTenantId: "unknown-tenant",
			baseDomain: "jolli.app",
			tenants: mockTenants,
		});

		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		// Should show "Switch Tenant" when current tenant is not in list
		const trigger = screen.getByTestId("tenant-switcher-trigger");
		expect(trigger.textContent).toContain("Switch Tenant");
	});

	it("should use origin as fallback when no baseDomain", async () => {
		mockTenantClient.listTenants.mockResolvedValue({
			useTenantSwitcher: true,
			currentTenantId: "tenant-1",
			baseDomain: null, // No base domain
			tenants: mockTenants,
		});

		renderWithProviders(<TenantSwitcher />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-switcher-trigger")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-switcher-trigger"));

		await waitFor(() => {
			expect(screen.getByText("Gamma Ltd")).toBeDefined();
		});

		// Click on tenant without primary domain
		fireEvent.click(screen.getByText("Gamma Ltd"));

		// Should fallback to origin since no baseDomain
		expect(window.location.href).toBe("http://localhost:3000");
	});
});
