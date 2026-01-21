import { ClientProvider } from "../../contexts/ClientContext";
import { RouterProvider } from "../../contexts/RouterContext";
import { Integrations } from "./Integrations";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockNavigationState = {
	navigate: mockNavigate,
	integrationView: "main" as string,
	integrationContainer: undefined as string | undefined,
	integrationContainerType: undefined as string | undefined,
	staticFileIntegrationId: undefined as number | undefined,
};

function createMockGitHubClient(overrides = {}) {
	return {
		getGitHubSummary: vi.fn(),
		getGitHubApps: vi.fn(),
		getGitHubInstallations: vi.fn(),
		getInstallationRepos: vi.fn(),
		...overrides,
	};
}

function createMockIntegrationsClient(overrides = {}) {
	return {
		listIntegrations: vi.fn().mockResolvedValue([]),
		createIntegration: vi.fn(),
		getIntegration: vi.fn(),
		deleteIntegration: vi.fn(),
		uploadFile: vi.fn(),
		...overrides,
	};
}

const mockClient = {
	github: vi.fn(() => createMockGitHubClient()),
	integrations: vi.fn(() => createMockIntegrationsClient()),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

vi.mock("../../contexts/NavigationContext", async () => {
	const actual = await vi.importActual("../../contexts/NavigationContext");
	return {
		...actual,
		useNavigation: () => mockNavigationState,
	};
});

vi.mock("../../contexts/OrgContext", () => ({
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

describe("Integrations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockNavigationState.integrationView = "main";
		mockNavigationState.integrationContainer = undefined;
		mockNavigationState.integrationContainerType = undefined;
		mockNavigationState.staticFileIntegrationId = undefined;
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render main integrations view and load summary", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockResolvedValue({
					orgCount: 2,
					totalRepos: 10,
					enabledRepos: 5,
					needsAttention: 1,
					lastSync: "2024-01-01T00:00:00Z",
				}),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Sources")).toBeDefined();
		});

		expect(screen.getByText("GitHub")).toBeDefined();
	});

	it("should show loading state initially", () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockImplementation(
					() =>
						new Promise(() => {
							// Never resolves - intentionally empty for testing loading state
						}),
				),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		expect(screen.getByText("Loading sources...")).toBeDefined();
	});

	it("should show empty state when no integrations exist", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockResolvedValue({
					orgCount: 0,
					totalRepos: 0,
					enabledRepos: 0,
					needsAttention: 0,
				}),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("No sources connected yet")).toBeDefined();
		});

		expect(screen.getByText("Connect Your First Source")).toBeDefined();
	});

	it("should show error message when loading fails", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockRejectedValue(new Error("Failed to load")),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load")).toBeDefined();
		});
	});

	it("should show generic error message when loading fails with non-Error", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockRejectedValue("Some string error"),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load source summary")).toBeDefined();
		});
	});

	it("should handle Add Integration button click", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockResolvedValue({
					orgCount: 0,
					totalRepos: 0,
					enabledRepos: 0,
					needsAttention: 0,
				}),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("No sources connected yet")).toBeDefined();
		});

		const addButton = screen.getByText("Connect Your First Source");
		fireEvent.click(addButton);

		await waitFor(() => {
			expect(screen.queryByText("No sources connected yet")).toBeNull();
		});
	});

	it("should handle setup completion and reload summary", async () => {
		const mockGetGitHubSummary = vi
			.fn()
			.mockResolvedValueOnce({
				orgCount: 0,
				totalRepos: 0,
				enabledRepos: 0,
				needsAttention: 0,
			})
			.mockResolvedValueOnce({
				orgCount: 1,
				totalRepos: 5,
				enabledRepos: 3,
				needsAttention: 0,
			});

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: mockGetGitHubSummary,
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("No sources connected yet")).toBeDefined();
		});

		const addButton = screen.getByText("Connect Your First Source");
		fireEvent.click(addButton);

		await waitFor(() => {
			expect(screen.queryByText("No sources connected yet")).toBeNull();
		});

		// Find and click the skip button in IntegrationSetup
		await waitFor(() => {
			expect(screen.getByText("Skip for now")).toBeDefined();
		});

		const skipButton = screen.getByText("Skip for now");
		fireEvent.click(skipButton);

		await waitFor(() => {
			expect(mockGetGitHubSummary).toHaveBeenCalledTimes(2);
		});
	});

	it("should render GitHubOrgUserList when integrationView is github", async () => {
		mockNavigationState.integrationView = "github";

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubApps: vi.fn().mockResolvedValue([]),
				getGitHubInstallations: vi.fn().mockResolvedValue([]),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("GitHub Installations")).toBeDefined();
		});
	});

	it("should render GitHubRepoList for org repos when view is github-org-repos", async () => {
		mockNavigationState.integrationView = "github-org-repos";
		mockNavigationState.integrationContainer = "test-org";
		mockNavigationState.integrationContainerType = "org";

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" }),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-org Repositories")).toBeDefined();
		});
	});

	it("should render GitHubRepoList for user repos when view is github-user-repos", async () => {
		mockNavigationState.integrationView = "github-user-repos";
		mockNavigationState.integrationContainer = "test-user";
		mockNavigationState.integrationContainerType = "user";

		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getInstallationRepos: vi.fn().mockResolvedValue({ repos: [], installationStatus: "active" }),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("test-user Repositories")).toBeDefined();
		});
	});

	it("should navigate to github integrations when clicking on IntegrationCard", async () => {
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockResolvedValue({
					orgCount: 2,
					totalRepos: 10,
					enabledRepos: 5,
					needsAttention: 1,
					lastSync: "2024-01-01T00:00:00Z",
				}),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("GitHub")).toBeDefined();
		});

		const githubCard = screen.getByText("GitHub").closest("div[role='button']");
		if (githubCard) {
			fireEvent.click(githubCard);
		}

		expect(mockNavigate).toHaveBeenCalledWith("/integrations/github");
	});

	it("should render StaticFileManage when view is static-file", async () => {
		mockNavigationState.integrationView = "static-file";
		mockNavigationState.staticFileIntegrationId = 123;

		mockClient.integrations.mockReturnValue(
			createMockIntegrationsClient({
				getIntegration: vi.fn().mockResolvedValue({
					id: 123,
					name: "My Static Files",
					type: "static_file",
					status: "active",
					metadata: { fileCount: 2 },
				}),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("My Static Files")).toBeDefined();
		});
	});

	describe("handleDeleteIntegration", () => {
		const mockStaticFileIntegration = {
			id: 1,
			name: "Test Static Files",
			type: "static_file" as const,
			status: "active" as const,
			metadata: { fileCount: 5, lastUpload: "2024-01-01T00:00:00Z" },
		};

		it("should do nothing when user cancels the confirm dialog", async () => {
			const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
			const mockDeleteIntegration = vi.fn();

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubSummary: vi.fn().mockResolvedValue({
						orgCount: 0,
						totalRepos: 0,
						enabledRepos: 0,
						needsAttention: 0,
					}),
				}),
			);
			mockClient.integrations.mockReturnValue(
				createMockIntegrationsClient({
					listIntegrations: vi.fn().mockResolvedValue([mockStaticFileIntegration]),
					deleteIntegration: mockDeleteIntegration,
				}),
			);

			render(
				<TestWrapper>
					<Integrations />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Test Static Files")).toBeDefined();
			});

			const deleteButton = screen.getByTestId("delete-integration-button");
			fireEvent.click(deleteButton);

			expect(confirmSpy).toHaveBeenCalled();
			expect(mockDeleteIntegration).not.toHaveBeenCalled();

			confirmSpy.mockRestore();
		});

		it("should delete integration and reload summary when user confirms", async () => {
			const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
			const mockDeleteIntegration = vi.fn().mockResolvedValue(undefined);
			const mockListIntegrations = vi
				.fn()
				.mockResolvedValueOnce([mockStaticFileIntegration])
				.mockResolvedValueOnce([]);
			const mockGetGitHubSummary = vi.fn().mockResolvedValue({
				orgCount: 0,
				totalRepos: 0,
				enabledRepos: 0,
				needsAttention: 0,
			});

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubSummary: mockGetGitHubSummary,
				}),
			);
			mockClient.integrations.mockReturnValue(
				createMockIntegrationsClient({
					listIntegrations: mockListIntegrations,
					deleteIntegration: mockDeleteIntegration,
				}),
			);

			render(
				<TestWrapper>
					<Integrations />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Test Static Files")).toBeDefined();
			});

			const deleteButton = screen.getByTestId("delete-integration-button");
			fireEvent.click(deleteButton);

			await waitFor(() => {
				expect(mockDeleteIntegration).toHaveBeenCalledWith(1);
			});

			// Should reload summary after deletion
			await waitFor(() => {
				expect(mockGetGitHubSummary).toHaveBeenCalledTimes(2);
				expect(mockListIntegrations).toHaveBeenCalledTimes(2);
			});

			confirmSpy.mockRestore();
		});

		it("should show error message when deletion fails with Error", async () => {
			const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
			const mockDeleteIntegration = vi.fn().mockRejectedValue(new Error("Deletion failed"));

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubSummary: vi.fn().mockResolvedValue({
						orgCount: 0,
						totalRepos: 0,
						enabledRepos: 0,
						needsAttention: 0,
					}),
				}),
			);
			mockClient.integrations.mockReturnValue(
				createMockIntegrationsClient({
					listIntegrations: vi.fn().mockResolvedValue([mockStaticFileIntegration]),
					deleteIntegration: mockDeleteIntegration,
				}),
			);

			render(
				<TestWrapper>
					<Integrations />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Test Static Files")).toBeDefined();
			});

			const deleteButton = screen.getByTestId("delete-integration-button");
			fireEvent.click(deleteButton);

			await waitFor(() => {
				expect(screen.getByText("Deletion failed")).toBeDefined();
			});

			confirmSpy.mockRestore();
		});

		it("should show fallback error message when deletion fails with non-Error", async () => {
			const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
			const mockDeleteIntegration = vi.fn().mockRejectedValue("Some string error");

			mockClient.github.mockReturnValue(
				createMockGitHubClient({
					getGitHubSummary: vi.fn().mockResolvedValue({
						orgCount: 0,
						totalRepos: 0,
						enabledRepos: 0,
						needsAttention: 0,
					}),
				}),
			);
			mockClient.integrations.mockReturnValue(
				createMockIntegrationsClient({
					listIntegrations: vi.fn().mockResolvedValue([mockStaticFileIntegration]),
					deleteIntegration: mockDeleteIntegration,
				}),
			);

			render(
				<TestWrapper>
					<Integrations />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Test Static Files")).toBeDefined();
			});

			const deleteButton = screen.getByTestId("delete-integration-button");
			fireEvent.click(deleteButton);

			await waitFor(() => {
				expect(screen.getByText("Failed to load source summary")).toBeDefined();
			});

			confirmSpy.mockRestore();
		});
	});

	it("should handle intlayer values with .key property", async () => {
		// Mock errorFallback with .key property to trigger inline ternary edge case (line 37)
		// and githubTitle with .key property for line 122
		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		// First test error case to cover line 37
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockRejectedValue("Network error"),
			}),
		);

		const { unmount } = render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		// Should show error message extracted from .key property
		await waitFor(() => {
			expect(screen.getByText("Failed to load source summary")).toBeDefined();
		});

		unmount();

		// Then test success case to cover lines 122-123
		mockClient.github.mockReturnValue(
			createMockGitHubClient({
				getGitHubSummary: vi.fn().mockResolvedValue({
					orgCount: 2,
					totalRepos: 10,
					enabledRepos: 5,
					needsAttention: false,
					lastSync: new Date(),
				}),
			}),
		);

		render(
			<TestWrapper>
				<Integrations />
			</TestWrapper>,
		);

		// Should render GitHub integration card with title extracted from .key property
		await waitFor(() => {
			expect(screen.getByText("GitHub")).toBeDefined();
		});
	});
});
