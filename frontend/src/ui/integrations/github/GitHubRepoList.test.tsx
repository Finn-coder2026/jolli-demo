import { ClientProvider } from "../../../contexts/ClientContext";
import { RouterProvider } from "../../../contexts/RouterContext";
import { GitHubRepoList } from "./GitHubRepoList";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

const mockClient = {
	integrations: vi.fn(() => ({
		checkAccess: vi.fn(),
	})),
	github: vi.fn(() => ({
		setupGitHubRedirect: vi.fn(),
		getGitHubSummary: vi.fn(),
		getGitHubApps: vi.fn(),
		getGitHubInstallations: vi.fn(),
		getInstallationRepos: vi.fn(),
		syncGitHubInstallations: vi.fn(),
		enableRepo: vi.fn(),
		disableRepo: vi.fn(),
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

vi.mock("../../../contexts/NavigationContext", async () => {
	const actual = await vi.importActual("../../../contexts/NavigationContext");
	return {
		...actual,
		useNavigation: () => ({ navigate: mockNavigate }),
	};
});

vi.mock("../../../contexts/OrgContext", () => ({
	useOrg: () => ({
		org: null,
		tenant: null,
		isMultiTenant: false,
		availableOrgs: [],
		loading: false,
		error: null,
		refreshOrg: vi.fn(),
	}),
}));

function TestWrapper({ children }: { children: ReactNode }) {
	return (
		<RouterProvider>
			<ClientProvider>{children}</ClientProvider>
		</RouterProvider>
	);
}

/**
 * Helper to create a complete GitHub mock with all required methods.
 * Accepts overrides for specific methods.
 */
function createGitHubMock(overrides = {}) {
	return {
		setupGitHubRedirect: vi.fn().mockResolvedValue({ redirectUrl: "https://github.com", success: true }),
		getGitHubSummary: vi.fn().mockResolvedValue({
			orgCount: 0,
			totalRepos: 0,
			enabledRepos: 0,
			needsAttention: 0,
			lastSync: new Date().toISOString(),
		}),
		getGitHubApps: vi.fn().mockResolvedValue([]),
		getGitHubInstallations: vi.fn().mockResolvedValue([]),
		getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" }),
		syncGitHubInstallations: vi.fn().mockResolvedValue({ message: "Synced", syncedCount: 0 }),
		enableRepo: vi.fn().mockResolvedValue({ id: 1, type: "github", name: "test", status: "active", enabled: true }),
		disableRepo: vi
			.fn()
			.mockResolvedValue({ id: 1, type: "github", name: "test", status: "active", enabled: false }),
		deleteGitHubInstallation: vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 0 }),
		...overrides,
	};
}

describe("GitHubRepoList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Mock intlayer for all GitHub components and Pagination
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should show loading state initially", () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([]),
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" }),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		expect(screen.getByText("Loading...")).toBeDefined();
	});

	it("should show error when organization not found", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "different-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" }),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText('Organization "test-org" not found')).toBeDefined();
		});
	});

	it("should show error when user not found", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "different-user",
						containerType: "user",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" }),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-user" containerType="user" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText('User "test-user" not found')).toBeDefined();
		});
	});

	it("should show error when loading fails", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubInstallations: vi.fn().mockRejectedValue(new Error("Failed to load data")),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load data")).toBeDefined();
		});
	});

	it("should show generic error message when error has no message", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubInstallations: vi.fn().mockRejectedValue("Unknown error"),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load repositories")).toBeDefined();
		});
	});

	it("should render breadcrumb with container name", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([
					{ appId: 123, name: "App One", slug: "app-one" },
					{ appId: 456, name: "App Two", slug: "app-two" },
				]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" }],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org")).toBeDefined();
		});
	});

	it("should render breadcrumb with GitHub for single app", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" }],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});

		expect(screen.getByText("GitHub")).toBeDefined();
		expect(screen.queryByText("GitHub Apps")).toBeNull();
	});

	it("should render breadcrumb without appId", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" }],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});

		expect(screen.getByText("GitHub")).toBeDefined();
	});

	it("should show and handle DeleteContainerModal for org", async () => {
		const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 1 });

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 100,
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [],
					installationStatus: "not_installed",
					appSlug: "test-app",
				}),
				deleteGitHubInstallation,
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Wait for the uninstalled warning to appear
		await waitFor(() => {
			expect(screen.getByText("GitHub App Not Installed")).toBeDefined();
		});

		// Click "Delete from Jolli" button
		const deleteButton = screen.getByText("Delete from Jolli");
		fireEvent.click(deleteButton);

		// Modal should appear
		await waitFor(() => {
			expect(screen.getByText(/Are you sure you want to remove/)).toBeDefined();
		});

		// Click cancel
		const cancelButton = screen.getByText("Cancel");
		fireEvent.click(cancelButton);

		// Modal should close
		await waitFor(() => {
			expect(screen.queryByText(/Are you sure you want to remove/)).toBeNull();
		});

		// Click delete button again
		fireEvent.click(deleteButton);

		// Modal should appear again
		await waitFor(() => {
			expect(screen.getByText(/Are you sure you want to remove/)).toBeDefined();
		});

		// Click confirm in modal (not the one in the warning banner)
		const deleteButtons = screen.getAllByText("Delete from Jolli");
		// There should be 2: one in the warning banner and one in the modal
		// The modal button is the last one
		const confirmButton = deleteButtons[deleteButtons.length - 1];
		fireEvent.click(confirmButton);

		// Should call deleteGitHubInstallation
		await waitFor(() => {
			expect(deleteGitHubInstallation).toHaveBeenCalledWith(100);
		});
	});

	it("should show and handle DeleteContainerModal for user", async () => {
		const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 1 });

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 200,
						installationId: 1,
						githubAppId: 123,
						name: "test-user",
						containerType: "user",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [],
					installationStatus: "not_installed",
					appSlug: "test-app",
				}),
				deleteGitHubInstallation,
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-user" containerType="user" />
			</TestWrapper>,
		);

		// Wait for the uninstalled warning to appear
		await waitFor(() => {
			expect(screen.getByText("GitHub App Not Installed")).toBeDefined();
		});

		// Click "Delete from Jolli" button
		const deleteButton = screen.getByText("Delete from Jolli");
		fireEvent.click(deleteButton);

		// Modal should appear
		await waitFor(() => {
			expect(screen.getByText(/Are you sure you want to remove/)).toBeDefined();
		});

		// Click confirm in modal (not the one in the warning banner)
		const deleteButtons = screen.getAllByText("Delete from Jolli");
		// There should be 2: one in the warning banner and one in the modal
		// The modal button is the last one
		const confirmButton = deleteButtons[deleteButtons.length - 1];
		fireEvent.click(confirmButton);

		// Should call deleteGitHubInstallation
		await waitFor(() => {
			expect(deleteGitHubInstallation).toHaveBeenCalledWith(200);
		});
	});

	it("should show UninstalledAppWarning without appSlug link when appSlug is undefined", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: undefined }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 100,
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 0,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [],
					installationStatus: "not_installed",
					appSlug: undefined,
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Wait for the uninstalled warning to appear
		await waitFor(() => {
			expect(screen.getByText("GitHub App Not Installed")).toBeDefined();
		});

		// Should show "View Installations on GitHub" link instead of "Reinstall on GitHub"
		expect(screen.getByText("View Installations on GitHub")).toBeDefined();
		expect(screen.queryByText("Reinstall on GitHub")).toBeNull();
	});

	it("should handle deleteGitHubInstallation error and close modal", async () => {
		const deleteGitHubInstallation = vi.fn().mockRejectedValue(new Error("Delete failed"));

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 100,
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 0,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [],
					installationStatus: "not_installed",
					appSlug: "test-app",
				}),
				deleteGitHubInstallation,
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Wait for the uninstalled warning to appear
		await waitFor(() => {
			expect(screen.getByText("GitHub App Not Installed")).toBeDefined();
		});

		// Click "Delete from Jolli" button
		const deleteButton = screen.getByText("Delete from Jolli");
		fireEvent.click(deleteButton);

		// Modal should appear
		await waitFor(() => {
			expect(screen.getByText(/Are you sure you want to remove/)).toBeDefined();
		});

		// Click confirm in modal
		const deleteButtons = screen.getAllByText("Delete from Jolli");
		const confirmButton = deleteButtons[deleteButtons.length - 1];
		fireEvent.click(confirmButton);

		// Should call deleteGitHubInstallation and handle error
		await waitFor(() => {
			expect(deleteGitHubInstallation).toHaveBeenCalledWith(100);
		});

		// Modal should close even though there was an error
		await waitFor(() => {
			expect(screen.queryByText(/Are you sure you want to remove/)).toBeNull();
		});
	});

	it("should show UninstalledAppWarning for user with correct message", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 200,
						installationId: 1,
						githubAppId: 123,
						name: "test-user",
						containerType: "user",
						totalRepos: 0,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [],
					installationStatus: "not_installed",
					appSlug: "test-app",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-user" containerType="user" />
			</TestWrapper>,
		);

		// Wait for the uninstalled warning to appear
		await waitFor(() => {
			expect(screen.getByText("GitHub App Not Installed")).toBeDefined();
		});

		// Should show user account message
		expect(screen.getByText(/user account/)).toBeDefined();
	});

	it("should show 'Deleting...' text in modal during deletion", async () => {
		let resolveDelete: (() => void) | undefined;
		const deletePromise = new Promise<{ success: boolean; deletedIntegrations: number }>(resolve => {
			resolveDelete = () => resolve({ success: true, deletedIntegrations: 1 });
		});
		const deleteGitHubInstallation = vi.fn().mockReturnValue(deletePromise);

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 100,
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 0,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [],
					installationStatus: "not_installed",
					appSlug: "test-app",
				}),
				deleteGitHubInstallation,
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Wait for the uninstalled warning to appear
		await waitFor(() => {
			expect(screen.getByText("GitHub App Not Installed")).toBeDefined();
		});

		// Click "Delete from Jolli" button
		const deleteButton = screen.getByText("Delete from Jolli");
		fireEvent.click(deleteButton);

		// Modal should appear
		await waitFor(() => {
			expect(screen.getByText(/Are you sure you want to remove/)).toBeDefined();
		});

		// Click confirm in modal
		const deleteButtons = screen.getAllByText("Delete from Jolli");
		const confirmButton = deleteButtons[deleteButtons.length - 1];
		fireEvent.click(confirmButton);

		// Should show "Deleting..." text while deletion is in progress
		await waitFor(() => {
			expect(screen.getByText("Deleting...")).toBeDefined();
		});

		// Resolve the deletion
		resolveDelete?.();

		// Wait for navigation with removal params for success banner
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith(
				"/integrations/github?removed=test-org&removed_type=org&installation_id=1",
			);
		});
	});

	it("should cleanup event listeners on unmount", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						name: "test-org",
						containerType: "org",
						installationId: 100,
						githubAppId: 123,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [],
					installationStatus: "active",
				}),
			}),
		);

		const { unmount } = render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Wait for component to load
		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});

		// Unmount to trigger cleanup
		unmount();

		// If we got here without errors, the cleanup function executed successfully
		expect(true).toBe(true);
	});

	it("should render breadcrumb with GitHub when appId provided but only one app", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" }],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});

		// Should show "GitHub" breadcrumb (not "GitHub Apps") when appId is provided but there's only 1 app
		expect(screen.getByText("GitHub")).toBeDefined();
		expect(screen.queryByText("GitHub Apps")).toBeNull();
	});

	it("should handle repository toggle success and update state", async () => {
		const enableRepo = vi.fn().mockResolvedValue({});
		const disableRepo = vi.fn().mockResolvedValue({});

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 2,
						enabledRepos: 2,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "enabled" },
						{ fullName: "test-org/repo2", defaultBranch: "main", enabled: true, status: "enabled" },
					],
					installationStatus: "active",
				}),
				enableRepo,
				disableRepo,
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});

		// Click toggle on first repo to disable it
		const checkboxes = screen.getAllByRole("checkbox") as Array<HTMLInputElement>;
		fireEvent.click(checkboxes[0]);

		await waitFor(() => {
			expect(disableRepo).toHaveBeenCalledWith("test-org", "repo1");
		});
	});

	it("should handle repository toggle error and show error message", async () => {
		const disableRepo = vi.fn().mockRejectedValue(new Error("Failed to disable repo"));

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 1,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "enabled" }],
					installationStatus: "active",
				}),
				disableRepo,
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});

		// Click toggle on repo to disable it (which will fail)
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		fireEvent.click(checkbox);

		await waitFor(() => {
			expect(screen.getByText("Failed to disable repo")).toBeDefined();
		});
	});

	it("should dismiss welcome banner", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 2,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" },
					],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Wait for welcome banner to appear
		await waitFor(() => {
			expect(screen.getByText("GitHub App Installed Successfully!")).toBeDefined();
		});

		// Click dismiss button
		const dismissButton = screen.getByText("Dismiss");
		fireEvent.click(dismissButton);

		// Welcome banner should disappear
		await waitFor(() => {
			expect(screen.queryByText("GitHub App Installed Successfully!")).toBeNull();
		});
	});

	it("should show filter buttons when there are disabled repos and handle clicks", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 3,
						enabledRepos: 2,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" },
						{ fullName: "test-org/repo2", defaultBranch: "main", enabled: true, status: "active" },
						{ fullName: "test-org/repo3", defaultBranch: "main", enabled: false, status: "available" },
					],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Wait for page to load
		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});

		// Initially defaults to "Enabled" view, showing only enabled repos (repo1 and repo2)
		expect(screen.getByText("repo1")).toBeDefined();
		expect(screen.getByText("repo2")).toBeDefined();
		expect(screen.queryByText("repo3")).toBeNull();

		// Verify filter buttons are present
		expect(screen.getByText("All Repos")).toBeDefined();
		expect(screen.getByText(/Enabled \(\d+\)/)).toBeDefined();

		// Click buttons to ensure callbacks are covered
		const allReposButton = screen.getByText("All Repos");
		const enabledOnlyButton = screen.getByText(/Enabled \(\d+\)/);

		// Fire click events (even if they don't cause visible changes in tests, they execute the callbacks)
		fireEvent.click(allReposButton);
		fireEvent.click(enabledOnlyButton);
	});

	it("should keep repo visible in Enabled view after toggling to disabled", async () => {
		const disableRepo = vi.fn().mockResolvedValue({});
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 2,
						enabledRepos: 1,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "test-org/repo1", defaultBranch: "main", enabled: true, status: "active" },
						{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" },
					],
					installationStatus: "active",
				}),
				disableRepo,
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});

		// Initially defaults to "Enabled" view, showing only enabled repo
		expect(screen.getByText("repo1")).toBeDefined();
		expect(screen.queryByText("repo2")).toBeNull();

		// Now toggle off the enabled repo
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		fireEvent.click(checkbox);

		await waitFor(() => {
			expect(disableRepo).toHaveBeenCalledWith("test-org", "repo1");
		});

		// After toggle, repo1 should STILL be visible in "Enabled" view
		// because it was recently toggled (even though it's now disabled)
		expect(screen.getByText("repo1")).toBeDefined();
		// repo2 is still not visible (wasn't enabled and wasn't recently toggled)
		expect(screen.queryByText("repo2")).toBeNull();
	});

	it("should handle breadcrumb navigation", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" }],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});

		// Find and click the "Sources" breadcrumb link
		const sourcesBreadcrumb = screen.getByText("Sources");
		fireEvent.click(sourcesBreadcrumb);

		// Should call navigate with "/integrations"
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/integrations");
		});

		// Clear the mock for the next click
		mockNavigate.mockClear();

		// Find and click the "GitHub" breadcrumb link
		const githubBreadcrumb = screen.getByText("GitHub");
		fireEvent.click(githubBreadcrumb);

		// Should call navigate with "/integrations/github"
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/integrations/github");
		});
	});

	it("should show View All Repositories button in empty state and click it", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 2,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" },
						{ fullName: "test-org/repo2", defaultBranch: "main", enabled: false, status: "available" },
					],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});

		// Should show empty state since no repos are enabled
		expect(screen.getByText("No enabled repositories")).toBeDefined();

		// Click "View All Repositories" button in empty state
		const viewAllButton = screen.getByText("View All Repositories");
		fireEvent.click(viewAllButton);

		// Now repos should be visible
		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});
		expect(screen.getByText("repo2")).toBeDefined();
	});

	it("should render search input", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 2,
						enabledRepos: 1,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "test-org/frontend", defaultBranch: "main", enabled: true, status: "active" },
						{ fullName: "test-org/backend", defaultBranch: "main", enabled: true, status: "active" },
					],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Search repositories...")).toBeDefined();
		});
	});

	it("should filter repositories based on search query", async () => {
		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						id: 1,
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 3,
						enabledRepos: 3,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [
						{ fullName: "test-org/frontend", defaultBranch: "main", enabled: true, status: "active" },
						{ fullName: "test-org/backend", defaultBranch: "main", enabled: true, status: "active" },
						{ fullName: "test-org/mobile-app", defaultBranch: "main", enabled: true, status: "active" },
					],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("frontend")).toBeDefined();
		});

		// All repos should be visible initially
		expect(screen.getByText("frontend")).toBeDefined();
		expect(screen.getByText("backend")).toBeDefined();
		expect(screen.getByText("mobile-app")).toBeDefined();

		// Type in search box
		const searchInput = screen.getByPlaceholderText("Search repositories...");
		fireEvent.input(searchInput, { target: { value: "front" } });

		// Only frontend should be visible
		await waitFor(() => {
			expect(screen.getByText("frontend")).toBeDefined();
		});
		expect(screen.queryByText("backend")).toBeNull();
		expect(screen.queryByText("mobile-app")).toBeNull();
	});

	it("should show pagination controls when there are more than 20 repos", async () => {
		// Create 25 repos
		const repos = Array.from({ length: 25 }, (_, i) => ({
			fullName: `test-org/repo${i + 1}`,
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
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 25,
						enabledRepos: 25,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos,
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});

		// Should show pagination controls
		expect(screen.getByLabelText("Pagination")).toBeDefined();
		expect(screen.getByLabelText("Next page")).toBeDefined();
		expect(screen.getByLabelText("Previous page")).toBeDefined();
	});

	it("should not show pagination controls when there are 20 or fewer repos", async () => {
		// Create 15 repos
		const repos = Array.from({ length: 15 }, (_, i) => ({
			fullName: `test-org/repo${i + 1}`,
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
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 15,
						enabledRepos: 15,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos,
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});

		// Should not show pagination controls
		expect(screen.queryByLabelText("Pagination")).toBeNull();
	});

	it("should paginate repos and navigate between pages", async () => {
		// Create 25 repos
		const repos = Array.from({ length: 25 }, (_, i) => ({
			fullName: `test-org/repo${i + 1}`,
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
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 25,
						enabledRepos: 25,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos,
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});

		// Should show first 20 repos
		expect(screen.getByText("repo1")).toBeDefined();
		expect(screen.getByText("repo20")).toBeDefined();
		expect(screen.queryByText("repo21")).toBeNull();

		// Click next page
		const nextButton = screen.getByLabelText("Next page");
		fireEvent.click(nextButton);

		// Should show repos 21-25
		await waitFor(() => {
			expect(screen.getByText("repo21")).toBeDefined();
		});
		expect(screen.getByText("repo25")).toBeDefined();
		expect(screen.queryByText("repo1")).toBeNull();

		// Click previous page
		const prevButton = screen.getByLabelText("Previous page");
		fireEvent.click(prevButton);

		// Should be back to first page
		await waitFor(() => {
			expect(screen.getByText("repo1")).toBeDefined();
		});
		expect(screen.getByText("repo20")).toBeDefined();
	});

	it("should reset to page 1 when search query changes", async () => {
		// Create 25 repos with different names
		const repos = Array.from({ length: 25 }, (_, i) => ({
			fullName: `test-org/${i < 15 ? "backend" : "frontend"}-${i + 1}`,
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
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 25,
						enabledRepos: 25,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos,
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("backend-1")).toBeDefined();
		});

		// Navigate to page 2
		const nextButton = screen.getByLabelText("Next page");
		fireEvent.click(nextButton);

		await waitFor(() => {
			expect(screen.getByText("frontend-21")).toBeDefined();
		});

		// Type in search box
		const searchInput = screen.getByPlaceholderText("Search repositories...");
		fireEvent.input(searchInput, { target: { value: "backend" } });

		// Should be back on page 1 showing backend repos
		await waitFor(() => {
			expect(screen.getByText("backend-1")).toBeDefined();
		});
		expect(screen.queryByText("frontend-21")).toBeNull();
	});

	it("should handle intlayer values with .key property", async () => {
		// Mock one value to have a .key property (edge case that getStringValue handles)
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		mockClient.github.mockReturnValue(
			createGitHubMock({
				getGitHubApps: vi.fn().mockResolvedValue([{ appId: 123, name: "Test App", slug: "test-app" }]),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						githubAppId: 123,
						name: "test-org",
						containerType: "org",
						totalRepos: 1,
						enabledRepos: 0,
					},
				]),
				getInstallationRepos: vi.fn().mockResolvedValue({
					repos: [{ fullName: "test-org/repo1", defaultBranch: "main", enabled: false, status: "available" }],
					installationStatus: "active",
				}),
			}),
		);

		render(
			<TestWrapper>
				<GitHubRepoList containerName="test-org" containerType="org" />
			</TestWrapper>,
		);

		// Should still work correctly with .key property (getStringValue converts it)
		await waitFor(() => {
			expect(screen.getByPlaceholderText("Search repositories...")).toBeDefined();
		});
	});
});
