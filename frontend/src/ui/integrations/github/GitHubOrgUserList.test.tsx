import { ClientProvider } from "../../../contexts/ClientContext";
import { RouterProvider } from "../../../contexts/RouterContext";
import { GitHubOrgUserList } from "./GitHubOrgUserList";
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
		getGitHubInstallations: vi.fn(),
		syncGitHubInstallations: vi.fn(),
		getInstallationRepos: vi.fn(),
		enableRepo: vi.fn(),
		disableRepo: vi.fn(),
		removeRepo: vi.fn(),
		deleteGitHubOrg: vi.fn(),
		deleteGitHubUser: vi.fn(),
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

function TestWrapper({ children }: { children: ReactNode }) {
	return (
		<RouterProvider>
			<ClientProvider>{children}</ClientProvider>
		</RouterProvider>
	);
}

function createMockGitHubClient(overrides = {}) {
	return {
		setupGitHubRedirect: vi.fn(),
		getGitHubSummary: vi.fn(),
		getGitHubInstallations: vi.fn().mockResolvedValue([]),
		syncGitHubInstallations: vi.fn(),
		getInstallationRepos: vi.fn(),
		enableRepo: vi.fn(),
		disableRepo: vi.fn(),
		removeRepo: vi.fn(),
		deleteGitHubOrg: vi.fn(),
		deleteGitHubUser: vi.fn(),
		deleteGitHubInstallation: vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 0 }),
		listAvailableInstallations: vi.fn().mockResolvedValue({ installations: [] }),
		connectExistingInstallation: vi.fn(),
		...overrides,
	};
}

describe("GitHubOrgUserList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should show loading state initially", () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		expect(screen.getByText("Loading installations...")).toBeDefined();
	});

	it("should render both organizations and users in separate sections", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 5,
						enabledRepos: 2,
						containerType: "org",
						appName: "Test App",
					},
					{
						installationId: 2,
						name: "test-user",
						totalRepos: 3,
						enabledRepos: 1,
						containerType: "user",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("GitHub Installations")).toBeDefined();
		});

		// Check for section headers
		expect(screen.getByText("Organizations")).toBeDefined();
		expect(screen.getByText("Users")).toBeDefined();

		// Check for installations
		expect(screen.getByText("test-org")).toBeDefined();
		expect(screen.getByText("2 of 5 repositories")).toBeDefined();
		expect(screen.getByText("test-user")).toBeDefined();
		expect(screen.getByText("1 of 3 repositories")).toBeDefined();
	});

	it("should render only organizations section when no users", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 5,
						enabledRepos: 2,
						containerType: "org",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Organizations")).toBeDefined();
		});

		expect(screen.queryByText("Users")).toBeNull();
		expect(screen.getByText("test-org")).toBeDefined();
	});

	it("should render only users section when no organizations", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 2,
						name: "test-user",
						totalRepos: 3,
						enabledRepos: 1,
						containerType: "user",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Users")).toBeDefined();
		});

		expect(screen.queryByText("Organizations")).toBeNull();
		expect(screen.getByText("test-user")).toBeDefined();
	});

	it("should not show app badges when single app exists", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 5,
						enabledRepos: 2,
						containerType: "org",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org")).toBeDefined();
		});

		// App name should not appear as a badge
		const appBadges = screen.queryAllByText("Test App");
		expect(appBadges.length).toBe(0);
	});

	it("should navigate to org repos when clicking on organization", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 5,
						enabledRepos: 2,
						containerType: "org",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org")).toBeDefined();
		});

		const cards = screen.getAllByRole("button");
		const orgCard = cards.find(card => card.textContent?.includes("test-org"));
		if (orgCard) {
			fireEvent.click(orgCard);
		}

		expect(mockNavigate).toHaveBeenCalledWith("/integrations/github/org/test-org");
	});

	it("should navigate to user repos when clicking on user", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 2,
						name: "test-user",
						totalRepos: 3,
						enabledRepos: 1,
						containerType: "user",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-user")).toBeDefined();
		});

		const cards = screen.getAllByRole("button");
		const userCard = cards.find(card => card.textContent?.includes("test-user"));
		if (userCard) {
			fireEvent.click(userCard);
		}

		expect(mockNavigate).toHaveBeenCalledWith("/integrations/github/user/test-user");
	});

	it("should handle keyboard navigation with Enter key", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 5,
						enabledRepos: 2,
						containerType: "org",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org")).toBeDefined();
		});

		const cards = screen.getAllByRole("button");
		const orgCard = cards.find(card => card.textContent?.includes("test-org"));
		if (orgCard) {
			fireEvent.keyDown(orgCard, { key: "Enter" });
		}

		expect(mockNavigate).toHaveBeenCalledWith("/integrations/github/org/test-org");
	});

	it("should handle keyboard navigation with Space key", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 5,
						enabledRepos: 2,
						containerType: "org",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org")).toBeDefined();
		});

		const cards = screen.getAllByRole("button");
		const orgCard = cards.find(card => card.textContent?.includes("test-org"));
		if (orgCard) {
			fireEvent.keyDown(orgCard, { key: " " });
		}

		expect(mockNavigate).toHaveBeenCalledWith("/integrations/github/org/test-org");
	});

	it("should show empty state when no installations found", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("No GitHub installations found")).toBeDefined();
		});

		expect(
			screen.getByText("Install the GitHub App on your organization or user account to get started"),
		).toBeDefined();
	});

	it("should show error message when loading fails", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockRejectedValue(new Error("Failed to load installations")),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load installations")).toBeDefined();
		});
	});

	it("should show generic error message when error has no message", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockRejectedValue("Unknown error"),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load GitHub installations")).toBeDefined();
		});
	});

	it("should filter installations by appId when provided", async () => {
		const getGitHubInstallations = vi.fn().mockResolvedValue([
			{
				installationId: 1,
				name: "test-org",
				totalRepos: 5,
				enabledRepos: 2,
				containerType: "org",
				appName: "Test App",
			},
		]);

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations,
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList appId="123" />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org")).toBeDefined();
		});

		expect(getGitHubInstallations).toHaveBeenCalledWith(123);
	});

	it("should show singular 'repository' when totalRepos is 1", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 1,
						enabledRepos: 0,
						containerType: "org",
						appName: "Test App",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("0 of 1 repository")).toBeDefined();
		});
	});

	it("should handle Install GitHub App button click and show installation state", async () => {
		const setupGitHubRedirect = vi.fn().mockResolvedValue({
			redirectUrl: "https://github.com/apps/jolli/installations/new",
		});

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect,
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			const buttons = screen.getAllByText("Install GitHub App");
			expect(buttons.length).toBeGreaterThan(0);
		});

		const installButtons = screen.getAllByText("Install GitHub App");
		fireEvent.click(installButtons[0]);

		await waitFor(() => {
			expect(setupGitHubRedirect).toHaveBeenCalled();
		});
	});

	it("should show not_installed badge when installationStatus is not_installed", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect: vi.fn(),
				getGitHubInstallations: vi.fn().mockResolvedValue([
					{
						installationId: 1,
						name: "test-org",
						totalRepos: 5,
						enabledRepos: 2,
						needsAttention: 0,
						containerType: "org",
						appName: "Test App",
						installationStatus: "not_installed",
					},
				]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Needs Attention")).toBeDefined();
		});
	});

	it("should handle setupGitHubRedirect returning an error", async () => {
		const setupGitHubRedirect = vi.fn().mockResolvedValue({
			error: "Failed to setup GitHub redirect",
		});

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect,
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			const buttons = screen.getAllByText("Install GitHub App");
			expect(buttons.length).toBeGreaterThan(0);
		});

		const installButtons = screen.getAllByText("Install GitHub App");
		fireEvent.click(installButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Failed to setup GitHub redirect")).toBeDefined();
		});
	});

	it("should handle setupGitHubRedirect returning no redirectUrl", async () => {
		const setupGitHubRedirect = vi.fn().mockResolvedValue({});

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect,
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			const buttons = screen.getAllByText("Install GitHub App");
			expect(buttons.length).toBeGreaterThan(0);
		});

		const installButtons = screen.getAllByText("Install GitHub App");
		fireEvent.click(installButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Failed to get installation URL")).toBeDefined();
		});
	});

	it("should handle setupGitHubRedirect throwing an error", async () => {
		const setupGitHubRedirect = vi.fn().mockRejectedValue(new Error("Network error"));

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect,
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			const buttons = screen.getAllByText("Install GitHub App");
			expect(buttons.length).toBeGreaterThan(0);
		});

		const installButtons = screen.getAllByText("Install GitHub App");
		fireEvent.click(installButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeDefined();
		});
	});

	it("should handle setupGitHubRedirect throwing a non-Error exception", async () => {
		const setupGitHubRedirect = vi.fn().mockRejectedValue("Non-error exception");

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				setupGitHubRedirect,
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<GitHubOrgUserList />
			</TestWrapper>,
		);

		await waitFor(() => {
			const buttons = screen.getAllByText("Install GitHub App");
			expect(buttons.length).toBeGreaterThan(0);
		});

		const installButtons = screen.getAllByText("Install GitHub App");
		fireEvent.click(installButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Failed to start installation")).toBeDefined();
		});
	});

	describe("available installations flow", () => {
		it("should show available installations panel when clicking Install and installations exist", async () => {
			const listAvailableInstallations = vi.fn().mockResolvedValue({
				installations: [
					{
						installationId: 123,
						accountLogin: "existing-org",
						accountType: "Organization",
						repos: ["repo1", "repo2"],
						alreadyConnectedToCurrentOrg: false,
					},
				],
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("Connect GitHub Installation")).toBeDefined();
			});

			expect(screen.getByText("existing-org")).toBeDefined();
			expect(screen.getByText("Organization • 2 repositories")).toBeDefined();
		});

		it("should connect existing installation when clicking Connect", async () => {
			const connectExistingInstallation = vi.fn().mockResolvedValue({
				success: true,
				redirectUrl: "/integrations/github/org/existing-org",
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
					connectExistingInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const connectButton = screen.getByText("Connect");
			fireEvent.click(connectButton);

			await waitFor(() => {
				expect(connectExistingInstallation).toHaveBeenCalledWith(123);
			});
		});

		it("should show error when connectExistingInstallation fails", async () => {
			const connectExistingInstallation = vi.fn().mockResolvedValue({
				success: false,
				error: "Connection failed",
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
					connectExistingInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const connectButton = screen.getByText("Connect");
			fireEvent.click(connectButton);

			await waitFor(() => {
				expect(screen.getByText("Connection failed")).toBeDefined();
			});
		});

		it("should show error when connectExistingInstallation throws", async () => {
			const connectExistingInstallation = vi.fn().mockRejectedValue(new Error("Network error"));

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
					connectExistingInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const connectButton = screen.getByText("Connect");
			fireEvent.click(connectButton);

			await waitFor(() => {
				expect(screen.getByText("Network error")).toBeDefined();
			});
		});

		it("should redirect to GitHub when clicking Install on new organization", async () => {
			const setupGitHubRedirect = vi.fn().mockResolvedValue({
				redirectUrl: "https://github.com/apps/jolli/installations/new",
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
					setupGitHubRedirect,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const installNewButton = screen.getByText("Install on new organization");
			fireEvent.click(installNewButton);

			await waitFor(() => {
				expect(setupGitHubRedirect).toHaveBeenCalled();
			});
		});

		it("should close available panel when clicking close button", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const closeButton = screen.getByLabelText("Close");
			fireEvent.click(closeButton);

			await waitFor(() => {
				expect(screen.queryByText("Connect GitHub Installation")).toBeNull();
			});
		});

		it("should fallback to GitHub redirect when listAvailableInstallations fails", async () => {
			const setupGitHubRedirect = vi.fn().mockResolvedValue({
				redirectUrl: "https://github.com/apps/jolli/installations/new",
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockRejectedValue(new Error("API error")),
					setupGitHubRedirect,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(setupGitHubRedirect).toHaveBeenCalled();
			});
		});

		it("should redirect to GitHub when no available installations exist", async () => {
			const setupGitHubRedirect = vi.fn().mockResolvedValue({
				redirectUrl: "https://github.com/apps/jolli/installations/new",
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({ installations: [] }),
					setupGitHubRedirect,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(setupGitHubRedirect).toHaveBeenCalled();
			});
		});

		it("should only show installations not already connected to current org", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "connected-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: true,
							},
							{
								installationId: 456,
								accountLogin: "available-org",
								accountType: "Organization",
								repos: ["repo2"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("available-org")).toBeDefined();
			});

			// The connected org should not be shown
			expect(screen.queryByText("connected-org")).toBeNull();
		});

		it("should show User type for user installations", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "some-user",
								accountType: "User",
								repos: ["repo1", "repo2", "repo3"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("some-user")).toBeDefined();
			});

			expect(screen.getByText("User • 3 repositories")).toBeDefined();
		});

		it("should show connecting state when connecting existing installation", async () => {
			// Create a promise we can control to keep the connecting state visible
			// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op placeholder
			let resolveConnect: (value: unknown) => void = () => {};
			const connectPromise = new Promise(resolve => {
				resolveConnect = resolve;
			});
			const connectExistingInstallation = vi.fn().mockReturnValue(connectPromise);

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
					connectExistingInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const connectButton = screen.getByText("Connect");
			fireEvent.click(connectButton);

			await waitFor(() => {
				expect(screen.getByText("Connecting installation...")).toBeDefined();
			});

			// Resolve the promise to clean up
			resolveConnect({ success: true, redirectUrl: "/test" });
		});

		it("should show generic error when connectExistingInstallation throws non-Error", async () => {
			const connectExistingInstallation = vi.fn().mockRejectedValue("Non-error exception");

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
					connectExistingInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const connectButton = screen.getByText("Connect");
			fireEvent.click(connectButton);

			await waitFor(() => {
				expect(screen.getByText("Failed to setup GitHub integration")).toBeDefined();
			});
		});

		it("should show generic error when connectExistingInstallation returns no error message", async () => {
			const connectExistingInstallation = vi.fn().mockResolvedValue({
				success: false,
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
					listAvailableInstallations: vi.fn().mockResolvedValue({
						installations: [
							{
								installationId: 123,
								accountLogin: "existing-org",
								accountType: "Organization",
								repos: ["repo1"],
								alreadyConnectedToCurrentOrg: false,
							},
						],
					}),
					connectExistingInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("No GitHub installations found")).toBeDefined();
			});

			const installButtons = screen.getAllByText("Install GitHub App");
			fireEvent.click(installButtons[0]);

			await waitFor(() => {
				expect(screen.getByText("existing-org")).toBeDefined();
			});

			const connectButton = screen.getByText("Connect");
			fireEvent.click(connectButton);

			await waitFor(() => {
				expect(screen.getByText("Failed to setup GitHub integration")).toBeDefined();
			});
		});
	});

	describe("remove installation flow", () => {
		it("should show remove button on each installation card", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
						{
							id: 2,
							installationId: 200,
							name: "test-user",
							totalRepos: 3,
							enabledRepos: 1,
							containerType: "user",
							appName: "Test App",
						},
					]),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			expect(screen.getByTestId("remove-installation-1")).toBeDefined();
			expect(screen.getByTestId("remove-installation-2")).toBeDefined();
		});

		it("should open confirmation modal when clicking remove button", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			expect(screen.getByText("Remove Organization")).toBeDefined();
			expect(screen.getByText(/Are you sure you want to remove/)).toBeDefined();
		});

		it("should not navigate when clicking remove button", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("should close modal when clicking cancel", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			const cancelButton = screen.getByTestId("remove-modal-cancel");
			fireEvent.click(cancelButton);

			await waitFor(() => {
				expect(screen.queryByTestId("remove-modal")).toBeNull();
			});
		});

		it("should call deleteGitHubInstallation when clicking confirm", async () => {
			const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 2 });

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
					deleteGitHubInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			const confirmButton = screen.getByTestId("remove-modal-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(deleteGitHubInstallation).toHaveBeenCalledWith(1);
			});
		});

		it("should show success banner with org GitHub link after successful deletion", async () => {
			const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 2 });

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
					deleteGitHubInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			const confirmButton = screen.getByTestId("remove-modal-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-success-banner")).toBeDefined();
			});

			expect(screen.getByText("Installation Removed")).toBeDefined();
			const githubLink = screen.getByTestId("github-uninstall-link");
			expect(githubLink.getAttribute("href")).toBe(
				"https://github.com/organizations/test-org/settings/installations/100",
			);
		});

		it("should show success banner with user GitHub link for user installations", async () => {
			const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 1 });

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 2,
							installationId: 200,
							name: "test-user",
							totalRepos: 3,
							enabledRepos: 1,
							containerType: "user",
							appName: "Test App",
						},
					]),
					deleteGitHubInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-user")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-2");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			expect(screen.getByText("Remove User")).toBeDefined();

			const confirmButton = screen.getByTestId("remove-modal-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-success-banner")).toBeDefined();
			});

			const githubLink = screen.getByTestId("github-uninstall-link");
			expect(githubLink.getAttribute("href")).toBe("https://github.com/settings/installations/200");
		});

		it("should remove installation from list after successful deletion", async () => {
			const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 2 });

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
						{
							id: 2,
							installationId: 200,
							name: "another-org",
							totalRepos: 3,
							enabledRepos: 1,
							containerType: "org",
							appName: "Test App",
						},
					]),
					deleteGitHubInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByTestId("remove-installation-1")).toBeDefined();
				expect(screen.getByTestId("remove-installation-2")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			const confirmButton = screen.getByTestId("remove-modal-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				// The remove button for the deleted installation should be gone
				expect(screen.queryByTestId("remove-installation-1")).toBeNull();
			});

			// The other org's remove button should still be visible
			expect(screen.getByTestId("remove-installation-2")).toBeDefined();
		});

		it("should dismiss success banner when clicking close button", async () => {
			const deleteGitHubInstallation = vi.fn().mockResolvedValue({ success: true, deletedIntegrations: 2 });

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
					deleteGitHubInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			const confirmButton = screen.getByTestId("remove-modal-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-success-banner")).toBeDefined();
			});

			const dismissButton = screen.getByTestId("dismiss-success-banner");
			fireEvent.click(dismissButton);

			await waitFor(() => {
				expect(screen.queryByTestId("remove-success-banner")).toBeNull();
			});
		});

		it("should show error banner when deletion fails", async () => {
			const deleteGitHubInstallation = vi.fn().mockRejectedValue(new Error("Failed to delete"));

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
					deleteGitHubInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			const confirmButton = screen.getByTestId("remove-modal-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(screen.getByText("Failed to delete")).toBeDefined();
			});

			// Modal should be closed
			expect(screen.queryByTestId("remove-modal")).toBeNull();
		});

		it("should show generic error when deletion throws non-Error", async () => {
			const deleteGitHubInstallation = vi.fn().mockRejectedValue("Non-error exception");

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([
						{
							id: 1,
							installationId: 100,
							name: "test-org",
							totalRepos: 5,
							enabledRepos: 2,
							containerType: "org",
							appName: "Test App",
						},
					]),
					deleteGitHubInstallation,
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("test-org")).toBeDefined();
			});

			const removeButton = screen.getByTestId("remove-installation-1");
			fireEvent.click(removeButton);

			await waitFor(() => {
				expect(screen.getByTestId("remove-modal")).toBeDefined();
			});

			const confirmButton = screen.getByTestId("remove-modal-confirm");
			fireEvent.click(confirmButton);

			await waitFor(() => {
				expect(screen.getByText("Failed to remove installation")).toBeDefined();
			});
		});
	});

	describe("URL param handling for removal banner", () => {
		const originalLocation = window.location;

		beforeEach(() => {
			// Mock window.location.search
			Object.defineProperty(window, "location", {
				value: { ...originalLocation, search: "" },
				writable: true,
			});
			// Mock history.replaceState
			vi.spyOn(window.history, "replaceState").mockImplementation(() => {
				// No-op mock
			});
		});

		afterEach(() => {
			Object.defineProperty(window, "location", {
				value: originalLocation,
				writable: true,
			});
			vi.restoreAllMocks();
		});

		it("should display success banner when removal URL params are present", async () => {
			// Set URL params as if navigating from org detail page after deletion
			Object.defineProperty(window, "location", {
				value: { ...originalLocation, search: "?removed=test-org&removed_type=org&installation_id=100" },
				writable: true,
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByTestId("remove-success-banner")).toBeDefined();
			});

			// Check banner content
			expect(screen.getByText("test-org")).toBeDefined();
			expect(screen.getByText("Installation Removed")).toBeDefined();

			// Check GitHub link
			const githubLink = screen.getByTestId("github-uninstall-link");
			expect(githubLink.getAttribute("href")).toBe(
				"https://github.com/organizations/test-org/settings/installations/100",
			);

			// URL should be cleaned
			expect(window.history.replaceState).toHaveBeenCalledWith({}, "", "/integrations/github");
		});

		it("should display success banner with user link for user removal", async () => {
			Object.defineProperty(window, "location", {
				value: { ...originalLocation, search: "?removed=john-doe&removed_type=user&installation_id=200" },
				writable: true,
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByTestId("remove-success-banner")).toBeDefined();
			});

			const githubLink = screen.getByTestId("github-uninstall-link");
			expect(githubLink.getAttribute("href")).toBe("https://github.com/settings/installations/200");
		});

		it("should not display success banner when no removal params are present", async () => {
			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubInstallations: vi.fn().mockResolvedValue([]),
				}),
			);

			render(
				<TestWrapper>
					<GitHubOrgUserList />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.queryByTestId("remove-success-banner")).toBeNull();
			});
		});
	});
});
