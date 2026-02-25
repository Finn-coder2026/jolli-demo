import { TenantSelector } from "./TenantSelector";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock useIntlayer
vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		selectTenantTitle: "Select Organization",
		selectTenantSubtitle: "Choose an organization to continue",
		loading: "Loading organizations...",
		fetchError: { value: "Failed to load organizations. Please try again." },
		emailNotAuthorizedError: { value: "Your email is not authorized for this organization." },
		noTenantsTitle: "No Organizations",
		noTenantsMessage:
			"You are not a member of any organizations yet. Please contact your administrator to be invited to an organization or request access.",
		default: "Default",
		lastUsed: "Last used",
		roleLabel: "Role",
		orgLabel: "Organization",
		loginWithAnotherAccount: "Sign in with a different account",
		signingOut: "Signing out...",
	}),
}));

// Mock Logger
vi.mock("../../util/Logger", () => ({
	getLog: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		error: vi.fn(),
	}),
}));

// Mock LastAccessedTenantStorage
const mockSaveLastAccessedTenant = vi.fn();
const mockGetLastAccessedTenant = vi.fn();
vi.mock("../../util/AuthCookieUtil", () => ({
	saveLastAccessedTenant: (...args: Array<unknown>) => mockSaveLastAccessedTenant(...args),
	getLastAccessedTenant: () => mockGetLastAccessedTenant(),
	clearEmailSelectionCookie: vi.fn(),
}));

function setTestCookie(cookie: string): void {
	// biome-ignore lint/suspicious/noDocumentCookie: Tests need to seed/clear jsdom cookies directly
	document.cookie = cookie;
}

describe("TenantSelector", () => {
	const mockTenants = [
		{
			tenantId: "tenant-1",
			orgId: "org-1",
			tenantSlug: "acme",
			tenantName: "Acme Corp",
			orgSlug: "main",
			orgName: "Main Org",
			role: "admin",
			isDefault: true,
			url: "https://acme.example.com",
		},
		{
			tenantId: "tenant-2",
			orgId: "org-2",
			tenantSlug: "beta",
			tenantName: "Beta Inc",
			orgSlug: "dev",
			orgName: "Dev Org",
			role: "member",
			isDefault: false,
			url: "https://beta.example.com",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		setTestCookie("email_selection=; Path=/; Max-Age=0");
		delete (window as { location?: Location }).location;
		(window as { location: Partial<Location> }).location = { href: "" };
	});

	it("should show loading state initially", () => {
		vi.mocked(global.fetch).mockImplementation(
			() =>
				new Promise(() => {
					// Never resolves to keep loading state
				}),
		);

		render(<TenantSelector />);

		expect(screen.getByTestId("tenant-selector-loading")).toBeDefined();
	});

	it("should render tenant list after successful fetch", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ tenants: mockTenants }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-title")).toBeDefined();
		});

		expect(screen.getByTestId("tenant-selector-subtitle")).toBeDefined();
		expect(screen.getByTestId("tenant-name-acme")).toBeDefined();
		expect(screen.getByTestId("tenant-name-beta")).toBeDefined();
		expect(screen.getByTestId("tenant-default-badge")).toBeDefined();
	});

	it("should show error state when fetch fails", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "Server error" }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-error")).toBeDefined();
		});
	});

	it("should show error state when fetch throws", async () => {
		vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-error")).toBeDefined();
		});
	});

	it("should show no tenants message when tenant list is empty", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ tenants: [] }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-no-tenants-title")).toBeDefined();
		});

		expect(screen.getByTestId("tenant-selector-no-tenants-message")).toBeDefined();
	});

	it("should not redirect to email selection from select-tenant when email_selection cookie exists", async () => {
		setTestCookie(
			`email_selection=${encodeURIComponent(JSON.stringify({ code: "abc", primary: "u@example.com" }))}; Path=/`,
		);

		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ tenants: [] }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-no-tenants-title")).toBeDefined();
		});

		expect(window.location.href).toBe("");
	});

	it("should auto-redirect when there is exactly one tenant", async () => {
		const singleTenant = [mockTenants[0]];
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: singleTenant }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ success: true, url: "https://acme.example.com" }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(window.location.href).toBe("https://acme.example.com");
		});

		// Verify the select API was called
		expect(global.fetch).toHaveBeenCalledWith("/api/auth/tenants/select", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tenantId: "tenant-1", orgId: "org-1" }),
		});
	});

	it("should navigate to tenant URL when clicking tenant button", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ success: true, url: "https://acme.example.com" }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			expect(window.location.href).toBe("https://acme.example.com");
		});

		// Verify the select API was called
		expect(global.fetch).toHaveBeenCalledWith("/api/auth/tenants/select", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ tenantId: "tenant-1", orgId: "org-1" }),
		});
	});

	it("should display tenant role and organization info", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ tenants: mockTenants }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-name-acme")).toBeDefined();
		});

		expect(screen.getByTestId("tenant-role-acme")).toBeDefined();
		expect(screen.getByTestId("tenant-role-beta")).toBeDefined();
		expect(screen.getByTestId("tenant-org-acme")).toBeDefined();
		expect(screen.getByTestId("tenant-org-beta")).toBeDefined();
	});

	it("should handle error response with invalid JSON", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.reject(new Error("Invalid JSON")),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-error")).toBeDefined();
		});
	});

	it("should show error when tenant select API fails", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 403,
				json: () => Promise.resolve({ error: "access_denied" }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-inline-error")).toBeDefined();
		});
	});

	it("should show error when tenant select API throws", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockRejectedValueOnce(new Error("Network error"));

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-inline-error")).toBeDefined();
		});
	});

	it("should fallback to tenant.url when API response has no url", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ success: true }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			// Falls back to tenant.url when API doesn't return url
			expect(window.location.href).toBe("https://acme.example.com");
		});
	});

	it("should redirect to login when fetch returns 401 status", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 401,
			json: () => Promise.resolve({ error: "not_authenticated" }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(window.location.href).toBe("/login");
		});
	});

	it("should redirect to login when fetch returns not_authenticated error", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 403,
			json: () => Promise.resolve({ error: "not_authenticated" }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(window.location.href).toBe("/login");
		});
	});

	it("should redirect to login when tenant select returns 401", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 401,
				json: () => Promise.resolve({ error: "not_authenticated" }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			expect(window.location.href).toBe("/login");
		});
	});

	it("should show email not authorized error when select returns email_not_authorized", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 403,
				json: () => Promise.resolve({ error: "email_not_authorized" }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-inline-error")).toBeDefined();
		});
	});

	it("should show switch account button in empty state", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ tenants: [] }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-no-tenants-title")).toBeDefined();
		});

		// Switch account button should be visible
		expect(screen.getByTestId("switch-account-button")).toBeDefined();
		expect(screen.getByTestId("switch-account-text")).toBeDefined();
	});

	it("should NOT show switch account button in error state", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: false,
			status: 500,
			json: () => Promise.resolve({ error: "Server error" }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-error")).toBeDefined();
		});

		// Switch account button should NOT be visible in error state
		expect(screen.queryByTestId("switch-account-button")).toBeNull();
	});

	it("should sign out and redirect to login when clicking switch account button", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: [] }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("switch-account-button")).toBeDefined();
		});

		const switchButton = screen.getByTestId("switch-account-button");
		fireEvent.click(switchButton);

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith("/api/auth/logout", {
				method: "POST",
				credentials: "include",
			});
			expect(window.location.href).toBe("/login");
		});
	});

	it("should show signing out message while signing out", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: [] }),
			} as Response)
			// Keep logout in-flight (never resolves) to test the loading state while signing out.
			// Using a never-resolving Promise avoids real-timer leakage into subsequent tests.
			// biome-ignore lint/suspicious/noEmptyBlockStatements: intentionally never resolves
			.mockImplementationOnce(() => new Promise<Response>(() => {}));

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("switch-account-button")).toBeDefined();
		});

		const switchButton = screen.getByTestId("switch-account-button");
		fireEvent.click(switchButton);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-loading")).toBeDefined();
		});
	});

	it("should highlight last accessed tenant with badge", async () => {
		mockGetLastAccessedTenant.mockReturnValue({
			tenantId: "tenant-1",
			orgId: "org-1",
		});

		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ tenants: mockTenants }),
		} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-name-acme")).toBeDefined();
		});

		// The last-accessed tenant should show the "Last used" badge
		expect(screen.getByTestId("tenant-last-used-badge")).toBeDefined();
	});

	it("should handle sign out failure gracefully", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: [] }),
			} as Response)
			// Make logout throw an error
			.mockRejectedValueOnce(new Error("Network error during sign out"));

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("switch-account-button")).toBeDefined();
		});

		const switchButton = screen.getByTestId("switch-account-button");
		fireEvent.click(switchButton);

		// After error, the component should recover and show the no-tenants view again
		await waitFor(() => {
			expect(screen.getByTestId("switch-account-button")).toBeDefined();
		});
	});

	it("should handle tenants response with no tenants field", async () => {
		vi.mocked(global.fetch).mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({}),
		} as Response);

		render(<TenantSelector />);

		// Should treat missing tenants field as empty array via ?? operator
		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-no-tenants-title")).toBeDefined();
		});
	});

	it("should include redirect parameter when selecting tenant with redirect in URL", async () => {
		// Set up window.location.search with redirect param
		delete (window as { location?: Location }).location;
		(window as { location: Partial<Location> }).location = {
			href: "",
			search: "?redirect=/dashboard",
		};

		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ success: true, url: "https://acme.example.com/dashboard" }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith("/api/auth/tenants/select", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tenantId: "tenant-1", orgId: "org-1", redirect: "/dashboard" }),
			});
		});

		// Await the full async chain so navigation completes before this test ends,
		// preventing async leakage into the next test
		await waitFor(() => {
			expect(window.location.href).toBe("https://acme.example.com/dashboard");
		});
	});

	it("should redirect to login with error for user_inactive response", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 403,
				json: () => Promise.resolve({ error: "user_inactive" }),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		await waitFor(() => {
			expect(window.location.href).toBe("/login?error=user_inactive");
		});
	});

	it("should handle select tenant with invalid JSON error response", async () => {
		vi.mocked(global.fetch)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tenants: mockTenants }),
			} as Response)
			.mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: () => Promise.reject(new Error("Invalid JSON")),
			} as Response);

		render(<TenantSelector />);

		await waitFor(() => {
			expect(screen.getByTestId("tenant-button-acme")).toBeDefined();
		});

		fireEvent.click(screen.getByTestId("tenant-button-acme"));

		// Should fall through to generic error since JSON parsing fails and error becomes "unknown"
		await waitFor(() => {
			expect(screen.getByTestId("tenant-selector-inline-error")).toBeDefined();
		});
	});
});
