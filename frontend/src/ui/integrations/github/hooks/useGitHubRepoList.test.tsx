import { ClientProvider } from "../../../../contexts/ClientContext";
import { RouterProvider } from "../../../../contexts/RouterContext";
import { useGitHubRepoList } from "./useGitHubRepoList";
import { act, renderHook, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

// Mock org context values
const mockOrgContext = {
	org: null as { slug: string } | null,
	tenant: null as { slug: string } | null,
	isMultiTenant: false,
	availableOrgs: [],
	loading: false,
	error: null,
	refreshOrg: vi.fn(),
};

vi.mock("../../../../contexts/OrgContext", () => ({
	useOrg: () => mockOrgContext,
}));

const mockClient = {
	github: vi.fn(() => ({
		syncGitHubInstallations: vi.fn(),
		getGitHubApps: vi.fn(),
		getGitHubInstallations: vi.fn(),
		getInstallationRepos: vi.fn(),
		deleteGitHubInstallation: vi.fn(),
	})),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

vi.mock("../../../../contexts/NavigationContext", async () => {
	const actual = await vi.importActual("../../../../contexts/NavigationContext");
	return {
		...actual,
		useNavigation: () => ({ navigate: mockNavigate }),
	};
});

// biome-ignore lint/suspicious/noExplicitAny: Testing wrapper needs flexible children type
function wrapper({ children }: any) {
	return (
		<RouterProvider>
			<ClientProvider>{children}</ClientProvider>
		</RouterProvider>
	);
}

function createGitHubMock(overrides = {}) {
	return {
		syncGitHubInstallations: vi.fn().mockResolvedValue({}),
		getGitHubApps: vi.fn().mockResolvedValue([]),
		getGitHubInstallations: vi.fn().mockResolvedValue([]),
		getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" }),
		deleteGitHubInstallation: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	};
}

describe("useGitHubRepoList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset org context to single-tenant mode
		mockOrgContext.org = null;
		mockOrgContext.tenant = null;
		mockOrgContext.isMultiTenant = false;
		// Clear localStorage
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("should initialize with loading state", () => {
		mockClient.github.mockReturnValue(createGitHubMock());

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		expect(result.current.loading).toBe(true);
		expect(result.current.repos).toEqual([]);
	});

	it("should load repos successfully", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.repos).toEqual(repos);
		expect(result.current.error).toBeUndefined();
		expect(result.current.installationId).toBe(100);
		expect(result.current.appSlug).toBe("test-app");
		expect(result.current.installationStatus).toBe("active");
	});

	it("should set error when organization not found", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "different-org",
						containerType: "org",
					},
				]),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBe('Organization "test-org" not found');
		expect(result.current.repos).toEqual([]);
		expect(result.current.installationId).toBeUndefined();
	});

	it("should set error when user not found", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "different-user",
						containerType: "user",
					},
				]),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-user", containerType: "user" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBe('User "test-user" not found');
	});

	it("should handle API errors gracefully", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubInstallations: vi.fn().mockRejectedValue(new Error("API error")),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBe("API error");
	});

	it("should handle non-Error exceptions", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubInstallations: vi.fn().mockRejectedValue("Unknown error"),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.error).toBe("Failed to load repositories");
	});

	it("should handle toggle success", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.repos.length).toBe(2);
		});

		// Toggle the first repo to disabled
		result.current.handleToggleSuccess(repos[0], false);

		await waitFor(() => {
			expect(result.current.repos[0].enabled).toBe(false);
		});

		expect(result.current.error).toBeUndefined();
	});

	it("should handle toggle error", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		result.current.handleToggleError("Failed to toggle");

		await waitFor(() => {
			expect(result.current.error).toBe("Failed to toggle");
		});
	});

	it("should filter repos but keep recently toggled ones visible in Enabled Only view", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.repos.length).toBe(2);
		});

		// Start in "Enabled Only" view, should show only enabled repo
		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(false);
		});
		expect(result.current.filteredRepos.length).toBe(1);
		expect(result.current.filteredRepos[0].fullName).toBe("test-org/repo1");

		// Now disable repo1 while in "Enabled Only" view
		result.current.handleToggleSuccess(repos[0], false);

		await waitFor(() => {
			expect(result.current.repos.find(r => r.fullName === "test-org/repo1")?.enabled).toBe(false);
		});

		// repo1 should still be visible because it was recently toggled (in Enabled Only view)
		await waitFor(() => {
			expect(result.current.filteredRepos.length).toBe(1);
			expect(result.current.filteredRepos[0].fullName).toBe("test-org/repo1");
		});
	});

	it("should add disabled repo to fadingOutRepos after toggle in Enabled Only view", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.repos.length).toBe(2);
		});

		// Ensure we're in "Enabled Only" view
		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(false);
		});

		// Initially, fadingOutRepos should be empty
		expect(result.current.fadingOutRepos.size).toBe(0);

		// Disable repo1 while in "Enabled Only" view
		result.current.handleToggleSuccess(repos[0], false);

		// fadingOutRepos should still be empty initially (timer hasn't fired yet)
		expect(result.current.fadingOutRepos.size).toBe(0);

		// Wait for fade-out timer (1.5 seconds + buffer)
		await new Promise(resolve => setTimeout(resolve, 1600));

		// Now fadingOutRepos should contain the disabled repo
		await waitFor(() => {
			expect(result.current.fadingOutRepos.has("test-org/repo1")).toBe(true);
		});
	});

	it("should NOT add disabled repo to fadingOutRepos when toggled in All Repos view", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.repos.length).toBe(2);
		});

		// Switch to "All Repos" view
		result.current.setShowAllRepos(true);

		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(true);
		});

		// Initially, fadingOutRepos should be empty
		expect(result.current.fadingOutRepos.size).toBe(0);

		// Disable repo1 while in "All Repos" view
		result.current.handleToggleSuccess(repos[0], false);

		// fadingOutRepos should still be empty
		expect(result.current.fadingOutRepos.size).toBe(0);

		// Wait for what would be the fade-out timer (1.5 seconds + buffer)
		await new Promise(resolve => setTimeout(resolve, 1600));

		// fadingOutRepos should STILL be empty - no fade-out in All Repos view
		expect(result.current.fadingOutRepos.size).toBe(0);
		expect(result.current.fadingOutRepos.has("test-org/repo1")).toBe(false);
	});

	it("should calculate enabledCount correctly", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo3", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.enabledCount).toBe(2);
		});
	});

	it("should show welcome banner when no repos are enabled", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.shouldShowWelcome).toBe(true);
		});
	});

	it("should not show welcome banner when showWelcome is false", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.shouldShowWelcome).toBe(true);
		});

		result.current.setShowWelcome(false);

		await waitFor(() => {
			expect(result.current.shouldShowWelcome).toBe(false);
		});
	});

	it("should show filter buttons when appropriate", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.shouldShowFilterButtons).toBe(true);
		});
	});

	it("should not show filter buttons when all repos are enabled", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: true, status: "active" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.shouldShowFilterButtons).toBe(false);
		});
	});

	it("should delete container and navigate away with removal params", async () => {
		const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true });

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 100,
						installationId: 1,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				deleteGitHubInstallation,
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.containerId).toBe(100);
		});

		await result.current.confirmDeleteContainer();

		await waitFor(() => {
			expect(deleteGitHubInstallation).toHaveBeenCalledWith(100);
		});

		// Should navigate with query params for success banner display
		expect(mockNavigate).toHaveBeenCalledWith(
			"/integrations/github?removed=test-org&removed_type=org&installation_id=1",
		);
	});

	it("should default to showing all repos when repos need attention", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "needs_repo_access" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: true, status: "active" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(true);
		});
	});

	it("should default to showing all repos when no repos are enabled", async () => {
		const repos = [
			{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" as const },
			{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" as const },
		];

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos, installationStatus: "active" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(true);
		});
	});

	it("should set installation status to not_installed", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "not_installed" }),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.installationStatus).toBe("not_installed");
		});
	});

	it("should generate breadcrumb items", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.breadcrumbItems).toBeDefined();
		});

		expect(result.current.breadcrumbItems?.length).toBeGreaterThan(0);
	});

	it("should reload repos when calling loadRepos", async () => {
		const getInstallationRepos = vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" });

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos,
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Clear the mock call count
		getInstallationRepos.mockClear();

		// Call loadRepos manually
		await result.current.loadRepos();

		expect(getInstallationRepos).toHaveBeenCalledTimes(1);
	});

	it("should handle showDeleteContainerModal state", async () => {
		mockClient.github.mockReturnValue(createGitHubMock());

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		expect(result.current.showDeleteContainerModal).toBe(false);

		result.current.setShowDeleteContainerModal(true);

		await waitFor(() => {
			expect(result.current.showDeleteContainerModal).toBe(true);
		});
	});

	it("should filter repositories based on search query", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "owner/repo-one", defaultBranch: "main", enabled: true, status: "active" as const },
						{ fullName: "owner/repo-two", defaultBranch: "main", enabled: true, status: "active" as const },
						{
							fullName: "owner/different",
							defaultBranch: "main",
							enabled: true,
							status: "active" as const,
						},
					],
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Initially all repos shown
		expect(result.current.paginatedRepos).toHaveLength(3);

		// Search for "repo"
		act(() => {
			result.current.setSearchQuery("repo");
		});

		await waitFor(() => {
			expect(result.current.paginatedRepos).toHaveLength(2);
			expect(result.current.paginatedRepos[0].fullName).toBe("owner/repo-one");
			expect(result.current.paginatedRepos[1].fullName).toBe("owner/repo-two");
		});

		// Search is case-insensitive
		act(() => {
			result.current.setSearchQuery("REPO");
		});

		await waitFor(() => {
			expect(result.current.paginatedRepos).toHaveLength(2);
		});
	});

	it("should paginate repositories (20 per page)", async () => {
		const repos = Array.from({ length: 45 }, (_, i) => ({
			fullName: `owner/repo-${i + 1}`,
			defaultBranch: "main",
			enabled: true,
			status: "active" as const,
		}));

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos,
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Page 1: should show first 20 repos
		expect(result.current.currentPage).toBe(1);
		expect(result.current.totalPages).toBe(3); // 45 repos / 20 per page = 3 pages
		expect(result.current.paginatedRepos).toHaveLength(20);
		expect(result.current.paginatedRepos[0].fullName).toBe("owner/repo-1");
		expect(result.current.paginatedRepos[19].fullName).toBe("owner/repo-20");

		// Go to page 2
		act(() => {
			result.current.setCurrentPage(2);
		});

		await waitFor(() => {
			expect(result.current.currentPage).toBe(2);
			expect(result.current.paginatedRepos).toHaveLength(20);
			expect(result.current.paginatedRepos[0].fullName).toBe("owner/repo-21");
			expect(result.current.paginatedRepos[19].fullName).toBe("owner/repo-40");
		});

		// Go to page 3 (last page with only 5 repos)
		act(() => {
			result.current.setCurrentPage(3);
		});

		await waitFor(() => {
			expect(result.current.currentPage).toBe(3);
			expect(result.current.paginatedRepos).toHaveLength(5);
			expect(result.current.paginatedRepos[0].fullName).toBe("owner/repo-41");
			expect(result.current.paginatedRepos[4].fullName).toBe("owner/repo-45");
		});
	});

	it("should reset to page 1 when search query changes", async () => {
		const repos = Array.from({ length: 45 }, (_, i) => ({
			fullName: `owner/repo-${i + 1}`,
			defaultBranch: "main",
			enabled: true,
			status: "active" as const,
		}));

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos,
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Go to page 2
		act(() => {
			result.current.setCurrentPage(2);
		});

		await waitFor(() => {
			expect(result.current.currentPage).toBe(2);
		});

		// Change search query - should reset to page 1
		act(() => {
			result.current.setSearchQuery("test");
		});

		await waitFor(() => {
			expect(result.current.currentPage).toBe(1);
		});
	});

	it("should reset to page 1 when filter changes", async () => {
		const repos = Array.from({ length: 45 }, (_, i) => ({
			fullName: `owner/repo-${i + 1}`,
			defaultBranch: "main",
			enabled: i < 30, // 30 enabled, 15 disabled
			status: "active" as const,
		}));

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos,
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Start with "All Repos" view
		act(() => {
			result.current.setShowAllRepos(true);
		});

		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(true);
		});

		// Go to page 2
		act(() => {
			result.current.setCurrentPage(2);
		});

		await waitFor(() => {
			expect(result.current.currentPage).toBe(2);
		});

		// Switch to "Enabled Only" - should reset to page 1
		act(() => {
			result.current.setShowAllRepos(false);
		});

		await waitFor(() => {
			expect(result.current.currentPage).toBe(1);
		});
	});

	it("should apply both filter and search together", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{
							fullName: "owner/enabled-repo",
							defaultBranch: "main",
							enabled: true,
							status: "active" as const,
						},
						{
							fullName: "owner/disabled-repo",
							defaultBranch: "main",
							enabled: false,
							status: "available" as const,
						},
						{
							fullName: "owner/enabled-different",
							defaultBranch: "main",
							enabled: true,
							status: "active" as const,
						},
					],
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Show only enabled repos
		act(() => {
			result.current.setShowAllRepos(false);
		});

		await waitFor(() => {
			expect(result.current.paginatedRepos).toHaveLength(2); // 2 enabled repos
		});

		// Search for "repo" - will auto-switch to "All Repos" view and show all repos matching search
		act(() => {
			result.current.setSearchQuery("repo");
		});

		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(true); // Auto-switched to "All Repos"
			expect(result.current.paginatedRepos).toHaveLength(2); // Both enabled-repo and disabled-repo match
			expect(result.current.paginatedRepos[0].fullName).toBe("owner/enabled-repo");
			expect(result.current.paginatedRepos[1].fullName).toBe("owner/disabled-repo");
		});
	});

	it("should switch to 'All Repos' view when user starts typing in search box", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{
							fullName: "owner/enabled-repo",
							defaultBranch: "main",
							enabled: true,
							status: "active" as const,
						},
						{
							fullName: "owner/disabled-repo",
							defaultBranch: "main",
							enabled: false,
							status: "available" as const,
						},
					],
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Start in "Enabled Only" view
		act(() => {
			result.current.setShowAllRepos(false);
		});

		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(false);
			expect(result.current.paginatedRepos).toHaveLength(1); // Only enabled repo
		});

		// Start typing in search box - should automatically switch to "All Repos"
		act(() => {
			result.current.setSearchQuery("disabled");
		});

		await waitFor(() => {
			expect(result.current.showAllRepos).toBe(true); // Switched to "All Repos"
			expect(result.current.paginatedRepos).toHaveLength(1); // Shows disabled repo
			expect(result.current.paginatedRepos[0].fullName).toBe("owner/disabled-repo");
		});
	});

	it("should clear search when clicking 'All Repos' filter button", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{
							fullName: "owner/frontend-repo",
							defaultBranch: "main",
							enabled: true,
							status: "active" as const,
						},
						{
							fullName: "owner/backend-repo",
							defaultBranch: "main",
							enabled: false,
							status: "available" as const,
						},
					],
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Type in search box
		act(() => {
			result.current.setSearchQuery("frontend");
		});

		await waitFor(() => {
			expect(result.current.searchQuery).toBe("frontend");
			expect(result.current.paginatedRepos).toHaveLength(1);
		});

		// Click "All Repos" button - should clear search
		act(() => {
			result.current.handleShowAllRepos();
		});

		await waitFor(() => {
			expect(result.current.searchQuery).toBe(""); // Search cleared
			expect(result.current.showAllRepos).toBe(true);
			expect(result.current.paginatedRepos).toHaveLength(2); // Shows all repos
		});
	});

	it("should clear search when clicking 'Enabled Only' filter button", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 100,
						githubAppId: 123,
						appSlug: "test-app",
						name: "test-org",
						containerType: "org",
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{
							fullName: "owner/frontend-repo",
							defaultBranch: "main",
							enabled: true,
							status: "active" as const,
						},
						{
							fullName: "owner/backend-repo",
							defaultBranch: "main",
							enabled: false,
							status: "available" as const,
						},
					],
					installationStatus: "active",
				}),
			}),
		);

		const { result } = renderHook(() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }), {
			wrapper,
		});

		await waitFor(() => {
			expect(result.current.loading).toBe(false);
		});

		// Type in search box
		act(() => {
			result.current.setSearchQuery("backend");
		});

		await waitFor(() => {
			expect(result.current.searchQuery).toBe("backend");
			expect(result.current.paginatedRepos).toHaveLength(1);
		});

		// Click "Enabled Only" button - should clear search
		act(() => {
			result.current.handleShowEnabledOnly();
		});

		await waitFor(() => {
			expect(result.current.searchQuery).toBe(""); // Search cleared
			expect(result.current.showAllRepos).toBe(false);
			expect(result.current.paginatedRepos).toHaveLength(1); // Shows only enabled repo
		});
	});

	describe("welcome banner localStorage persistence", () => {
		it("should persist welcome banner dismissal to localStorage", async () => {
			mockClient.github.mockReturnValue(
				createGitHubMock({
					getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							githubAppId: 123,
							appSlug: "test-app",
							name: "test-org",
							containerType: "org",
						},
					]),
					getInstallationRepos: vi.fn().mockResolvedValue({
						repos: [
							{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						],
						installationStatus: "active",
					}),
				}),
			);

			const { result } = renderHook(
				() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }),
				{
					wrapper,
				},
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Initially banner should be shown
			expect(result.current.showWelcome).toBe(true);
			expect(localStorage.getItem("jolli:github:welcome-dismissed:test-org")).toBeNull();

			// Dismiss the banner
			act(() => {
				result.current.setShowWelcome(false);
			});

			await waitFor(() => {
				expect(result.current.showWelcome).toBe(false);
			});

			// Check localStorage was updated
			expect(localStorage.getItem("jolli:github:welcome-dismissed:test-org")).toBe("true");
		});

		it("should read dismissed state from localStorage on load", async () => {
			// Pre-set localStorage to indicate banner was dismissed
			localStorage.setItem("jolli:github:welcome-dismissed:test-org", "true");

			mockClient.github.mockReturnValue(
				createGitHubMock({
					getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							githubAppId: 123,
							appSlug: "test-app",
							name: "test-org",
							containerType: "org",
						},
					]),
					getInstallationRepos: vi.fn().mockResolvedValue({
						repos: [
							{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						],
						installationStatus: "active",
					}),
				}),
			);

			const { result } = renderHook(
				() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }),
				{
					wrapper,
				},
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Banner should not be shown since it was previously dismissed
			await waitFor(() => {
				expect(result.current.showWelcome).toBe(false);
			});
		});

		it("should use different localStorage keys for different containers", async () => {
			mockClient.github.mockReturnValue(
				createGitHubMock({
					getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							githubAppId: 123,
							appSlug: "test-app",
							name: "org-one",
							containerType: "org",
						},
					]),
					getInstallationRepos: vi.fn().mockResolvedValue({
						repos: [
							{ fullName: "org-one/repo1", defaultBranch: "main", enabled: false, status: "available" },
						],
						installationStatus: "active",
					}),
				}),
			);

			const { result: resultOne } = renderHook(
				() => useGitHubRepoList({ containerName: "org-one", containerType: "org" }),
				{ wrapper },
			);

			await waitFor(() => {
				expect(resultOne.current.loading).toBe(false);
			});

			// Dismiss banner for org-one
			act(() => {
				resultOne.current.setShowWelcome(false);
			});

			await waitFor(() => {
				expect(resultOne.current.showWelcome).toBe(false);
			});

			// Verify org-one is dismissed but org-two would not be
			expect(localStorage.getItem("jolli:github:welcome-dismissed:org-one")).toBe("true");
			expect(localStorage.getItem("jolli:github:welcome-dismissed:org-two")).toBeNull();
		});

		it("should use multi-tenant localStorage key when in multi-tenant mode", async () => {
			// Set up multi-tenant mode
			mockOrgContext.isMultiTenant = true;
			mockOrgContext.tenant = { slug: "my-tenant" };
			mockOrgContext.org = { slug: "my-org" };

			mockClient.github.mockReturnValue(
				createGitHubMock({
					getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							githubAppId: 123,
							appSlug: "test-app",
							name: "test-org",
							containerType: "org",
						},
					]),
					getInstallationRepos: vi.fn().mockResolvedValue({
						repos: [
							{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						],
						installationStatus: "active",
					}),
				}),
			);

			const { result } = renderHook(
				() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }),
				{
					wrapper,
				},
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Dismiss the banner
			act(() => {
				result.current.setShowWelcome(false);
			});

			await waitFor(() => {
				expect(result.current.showWelcome).toBe(false);
			});

			// Check multi-tenant localStorage key was used
			expect(localStorage.getItem("jolli:github:welcome-dismissed:my-tenant:my-org:test-org")).toBe("true");
			// Single-tenant key should not be set
			expect(localStorage.getItem("jolli:github:welcome-dismissed:test-org")).toBeNull();
		});

		it("should read multi-tenant dismissed state from localStorage", async () => {
			// Set up multi-tenant mode
			mockOrgContext.isMultiTenant = true;
			mockOrgContext.tenant = { slug: "my-tenant" };
			mockOrgContext.org = { slug: "my-org" };

			// Pre-set localStorage with multi-tenant key
			localStorage.setItem("jolli:github:welcome-dismissed:my-tenant:my-org:test-org", "true");

			mockClient.github.mockReturnValue(
				createGitHubMock({
					getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							githubAppId: 123,
							appSlug: "test-app",
							name: "test-org",
							containerType: "org",
						},
					]),
					getInstallationRepos: vi.fn().mockResolvedValue({
						repos: [
							{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						],
						installationStatus: "active",
					}),
				}),
			);

			const { result } = renderHook(
				() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }),
				{
					wrapper,
				},
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Banner should not be shown since it was previously dismissed
			await waitFor(() => {
				expect(result.current.showWelcome).toBe(false);
			});
		});

		it("should gracefully handle localStorage.getItem errors", async () => {
			// Mock localStorage.getItem to throw an error
			const originalGetItem = localStorage.getItem;
			vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
				throw new Error("localStorage is disabled");
			});

			mockClient.github.mockReturnValue(
				createGitHubMock({
					getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							githubAppId: 123,
							appSlug: "test-app",
							name: "test-org",
							containerType: "org",
						},
					]),
					getInstallationRepos: vi.fn().mockResolvedValue({
						repos: [
							{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						],
						installationStatus: "active",
					}),
				}),
			);

			const { result } = renderHook(
				() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }),
				{
					wrapper,
				},
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Hook should work normally even when localStorage throws
			// Default state is showWelcome = true
			expect(result.current.showWelcome).toBe(true);

			// Restore original
			vi.spyOn(Storage.prototype, "getItem").mockImplementation(originalGetItem);
		});

		it("should gracefully handle localStorage.setItem errors", async () => {
			// Mock localStorage.setItem to throw an error
			const originalSetItem = localStorage.setItem;
			vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
				throw new Error("localStorage quota exceeded");
			});

			mockClient.github.mockReturnValue(
				createGitHubMock({
					getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							githubAppId: 123,
							appSlug: "test-app",
							name: "test-org",
							containerType: "org",
						},
					]),
					getInstallationRepos: vi.fn().mockResolvedValue({
						repos: [
							{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						],
						installationStatus: "active",
					}),
				}),
			);

			const { result } = renderHook(
				() => useGitHubRepoList({ containerName: "test-org", containerType: "org" }),
				{
					wrapper,
				},
			);

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Initially banner should be shown
			expect(result.current.showWelcome).toBe(true);

			// Dismiss the banner - should work even when localStorage throws
			act(() => {
				result.current.setShowWelcome(false);
			});

			await waitFor(() => {
				// State should still update even though localStorage failed
				expect(result.current.showWelcome).toBe(false);
			});

			// Restore original
			vi.spyOn(Storage.prototype, "setItem").mockImplementation(originalSetItem);
		});
	});
});
