import { ClientProvider } from "../../../contexts/ClientContext";
import { RouterProvider } from "../../../contexts/RouterContext";
import { GitHubIntegrationFlow } from "./GitHubIntegrationFlow";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn();
const mockOnComplete = vi.fn();

const mockListAvailableInstallations = vi.fn();
const mockConnectExistingInstallation = vi.fn();
const mockSetupGitHubRedirect = vi.fn();

const mockClient = {
	github: vi.fn(() => ({
		listAvailableInstallations: mockListAvailableInstallations,
		connectExistingInstallation: mockConnectExistingInstallation,
		setupGitHubRedirect: mockSetupGitHubRedirect,
	})),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

vi.mock("../../../contexts/RouterContext", async () => {
	const actual = await vi.importActual("../../../contexts/RouterContext");
	return {
		...actual,
		RouterProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		useRedirect: () => mockRedirect,
	};
});

function TestWrapper({ children }: { children: ReactNode }) {
	return (
		<RouterProvider>
			<ClientProvider>{children}</ClientProvider>
		</RouterProvider>
	);
}

describe("GitHubIntegrationFlow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("when no available installations exist", () => {
		it("should redirect to GitHub when listAvailableInstallations returns empty", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: [] });
			mockSetupGitHubRedirect.mockResolvedValue({
				redirectUrl: "https://github.com/apps/jolli/installations/new",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(mockListAvailableInstallations).toHaveBeenCalled();
				expect(mockSetupGitHubRedirect).toHaveBeenCalled();
				expect(mockRedirect).toHaveBeenCalledWith("https://github.com/apps/jolli/installations/new");
			});
		});

		it("should redirect to GitHub when listAvailableInstallations throws an error", async () => {
			mockListAvailableInstallations.mockRejectedValue(new Error("API error"));
			mockSetupGitHubRedirect.mockResolvedValue({
				redirectUrl: "https://github.com/apps/jolli/installations/new",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(mockListAvailableInstallations).toHaveBeenCalled();
				expect(mockSetupGitHubRedirect).toHaveBeenCalled();
				expect(mockRedirect).toHaveBeenCalledWith("https://github.com/apps/jolli/installations/new");
			});
		});

		it("should filter out already connected installations", async () => {
			mockListAvailableInstallations.mockResolvedValue({
				installations: [{ installationId: 1, accountLogin: "org1", alreadyConnectedToCurrentOrg: true }],
			});
			mockSetupGitHubRedirect.mockResolvedValue({
				redirectUrl: "https://github.com/apps/jolli/installations/new",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(mockSetupGitHubRedirect).toHaveBeenCalled();
				expect(mockRedirect).toHaveBeenCalledWith("https://github.com/apps/jolli/installations/new");
			});
		});
	});

	describe("when available installations exist", () => {
		const mockInstallations = [
			{
				installationId: 123,
				accountLogin: "acme-org",
				accountType: "Organization" as const,
				repos: ["acme-org/repo1", "acme-org/repo2"],
				alreadyConnectedToCurrentOrg: false,
			},
			{
				installationId: 456,
				accountLogin: "user-account",
				accountType: "User" as const,
				repos: ["user-account/personal-repo"],
				alreadyConnectedToCurrentOrg: false,
			},
		];

		it("should show selection UI with available installations", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: mockInstallations });

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Connect GitHub Installation")).toBeDefined();
				expect(screen.getByText("acme-org")).toBeDefined();
				expect(screen.getByText("user-account")).toBeDefined();
			});

			// Verify repo counts are shown
			expect(screen.getByText(/2 repositories/)).toBeDefined();
			expect(screen.getByText(/1 repositories/)).toBeDefined();
		});

		it("should show organization and user labels correctly", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: mockInstallations });

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText(/Organization/)).toBeDefined();
				expect(screen.getByText(/User/)).toBeDefined();
			});
		});

		it("should connect existing installation when clicked", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: mockInstallations });
			mockConnectExistingInstallation.mockResolvedValue({
				success: true,
				redirectUrl: "https://tenant.example.com/integrations/github/org/acme-org?new_installation=true",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("acme-org")).toBeDefined();
			});

			// Click on the acme-org installation button
			const acmeButton = screen.getByText("acme-org").closest("button");
			if (acmeButton) {
				fireEvent.click(acmeButton);
			}

			await waitFor(() => {
				expect(mockConnectExistingInstallation).toHaveBeenCalledWith(123);
				expect(mockRedirect).toHaveBeenCalledWith(
					"https://tenant.example.com/integrations/github/org/acme-org?new_installation=true",
				);
			});
		});

		it("should show error when connectExistingInstallation fails", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: mockInstallations });
			mockConnectExistingInstallation.mockResolvedValue({
				success: false,
				error: "Installation not found",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("acme-org")).toBeDefined();
			});

			const acmeButton = screen.getByText("acme-org").closest("button");
			if (acmeButton) {
				fireEvent.click(acmeButton);
			}

			await waitFor(() => {
				expect(screen.getByText("Installation not found")).toBeDefined();
			});
		});

		it("should show error when connectExistingInstallation throws", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: mockInstallations });
			mockConnectExistingInstallation.mockRejectedValue(new Error("Network error"));

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("acme-org")).toBeDefined();
			});

			const acmeButton = screen.getByText("acme-org").closest("button");
			if (acmeButton) {
				fireEvent.click(acmeButton);
			}

			await waitFor(() => {
				expect(screen.getByText("Network error")).toBeDefined();
			});
		});

		it("should redirect to GitHub when 'Install on new organization' is clicked", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: mockInstallations });
			mockSetupGitHubRedirect.mockResolvedValue({
				redirectUrl: "https://github.com/apps/jolli/installations/new",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Install on new organization")).toBeDefined();
			});

			fireEvent.click(screen.getByText("Install on new organization"));

			await waitFor(() => {
				expect(mockSetupGitHubRedirect).toHaveBeenCalled();
				expect(mockRedirect).toHaveBeenCalledWith("https://github.com/apps/jolli/installations/new");
			});
		});

		it("should call onComplete when Go Back is clicked from selection UI", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: mockInstallations });

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Go Back")).toBeDefined();
			});

			fireEvent.click(screen.getByText("Go Back"));

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe("error handling for redirect flow", () => {
		it("should show error when setupGitHubRedirect returns an error", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: [] });
			mockSetupGitHubRedirect.mockResolvedValue({
				error: "Failed to setup GitHub redirect",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Failed to setup GitHub redirect")).toBeDefined();
			});

			expect(mockRedirect).not.toHaveBeenCalled();
		});

		it("should show error when setupGitHubRedirect returns no redirectUrl", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: [] });
			mockSetupGitHubRedirect.mockResolvedValue({});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Failed to get installation URL")).toBeDefined();
			});

			expect(mockRedirect).not.toHaveBeenCalled();
		});

		it("should show error when setupGitHubRedirect throws an error", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: [] });
			mockSetupGitHubRedirect.mockRejectedValue(new Error("Network error"));

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Network error")).toBeDefined();
			});

			expect(mockRedirect).not.toHaveBeenCalled();
		});

		it("should show generic error message when error has no message", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: [] });
			mockSetupGitHubRedirect.mockRejectedValue("Unknown error");

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Failed to setup GitHub integration")).toBeDefined();
			});

			expect(mockRedirect).not.toHaveBeenCalled();
		});

		it("should call onComplete when Go Back button is clicked from error state", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: [] });
			mockSetupGitHubRedirect.mockResolvedValue({
				error: "Failed to setup GitHub redirect",
			});

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Failed to setup GitHub redirect")).toBeDefined();
			});

			const goBackButton = screen.getByText("Go Back");
			fireEvent.click(goBackButton);

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe("loading states", () => {
		it("should show loading state initially", () => {
			// Make the API call hang - never-resolving promise
			mockListAvailableInstallations.mockImplementation(
				() =>
					new Promise(() => {
						/* intentionally never resolves */
					}),
			);

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			expect(screen.getByText("Checking for available installations...")).toBeDefined();
		});

		it("should show connecting state when connecting existing installation", async () => {
			mockListAvailableInstallations.mockResolvedValue({
				installations: [
					{
						installationId: 123,
						accountLogin: "acme-org",
						accountType: "Organization",
						repos: ["repo1"],
						alreadyConnectedToCurrentOrg: false,
					},
				],
			});
			// Make connect hang to see the connecting state - never-resolving promise
			mockConnectExistingInstallation.mockImplementation(
				() =>
					new Promise(() => {
						/* intentionally never resolves */
					}),
			);

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("acme-org")).toBeDefined();
			});

			const acmeButton = screen.getByText("acme-org").closest("button");
			if (acmeButton) {
				fireEvent.click(acmeButton);
			}

			await waitFor(() => {
				expect(screen.getByText("Connecting installation...")).toBeDefined();
			});
		});

		it("should show redirecting state when redirecting to GitHub", async () => {
			mockListAvailableInstallations.mockResolvedValue({ installations: [] });
			// Make redirect setup hang - never-resolving promise
			mockSetupGitHubRedirect.mockImplementation(
				() =>
					new Promise(() => {
						/* intentionally never resolves */
					}),
			);

			render(
				<TestWrapper>
					<GitHubIntegrationFlow onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Redirecting to GitHub...")).toBeDefined();
			});
		});
	});
});
