import { ClientProvider } from "../../contexts/ClientContext";
import { RouterProvider } from "../../contexts/RouterContext";
import { IntegrationSetup } from "./IntegrationSetup";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
	integrations: vi.fn(() => ({
		listIntegrations: vi.fn(),
	})),
	github: vi.fn(() => ({
		setupGitHubRedirect: vi.fn(),
	})),
};

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

function TestWrapper({ children }: { children: ReactNode }) {
	return (
		<RouterProvider>
			<ClientProvider>{children}</ClientProvider>
		</RouterProvider>
	);
}

describe("IntegrationSetup", () => {
	const mockOnComplete = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.integrations.mockReturnValue({
			listIntegrations: vi.fn().mockResolvedValue([]),
		});
		mockClient.github.mockReturnValue({
			setupGitHubRedirect: vi.fn(),
		});
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	describe("Welcome Step", () => {
		it("should render welcome step by default with first integration text", async () => {
			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Welcome to Jolli!")).toBeDefined();
			});
			// Should show integration type options
			expect(screen.getByText("GitHub")).toBeDefined();
			expect(screen.getByText("Static Files")).toBeDefined();
			expect(screen.getByText("Skip for now")).toBeDefined();
		});

		it("should render welcome step with additional integration text when integrations exist", async () => {
			mockClient.integrations.mockReturnValue({
				listIntegrations: vi.fn().mockResolvedValue([{ id: 1, type: "github", name: "existing/repo" }]),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Add a Source")).toBeDefined();
			});
			// Should still show integration type options
			expect(screen.getByText("GitHub")).toBeDefined();
			expect(screen.getByText("Static Files")).toBeDefined();
		});

		it("should show first integration text when listIntegrations fails", async () => {
			mockClient.integrations.mockReturnValue({
				listIntegrations: vi.fn().mockRejectedValue(new Error("Failed to fetch integrations")),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Welcome to Jolli!")).toBeDefined();
			});
			// Should show integration type options
			expect(screen.getByText("GitHub")).toBeDefined();
			expect(screen.getByText("Static Files")).toBeDefined();
		});

		it("should navigate to GitHub integration flow when clicking GitHub card", async () => {
			mockClient.github.mockReturnValue({
				setupGitHubRedirect: vi.fn().mockResolvedValue({
					redirectUrl: "https://github.com/apps/jolli/installations/new",
				}),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("GitHub")).toBeDefined();
			});

			const githubCard = screen.getByText("GitHub").closest("button");
			expect(githubCard).not.toBeNull();
			fireEvent.click(githubCard as HTMLElement);

			await waitFor(() => {
				expect(screen.getByText("Redirecting to GitHub...")).toBeDefined();
			});
		});

		it("should call onComplete when clicking Skip for now", async () => {
			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("Skip for now")).toBeDefined();
			});

			const skipButton = screen.getByText("Skip for now");
			fireEvent.click(skipButton);

			expect(mockOnComplete).toHaveBeenCalled();
		});
	});

	describe("Success Step", () => {
		it("should render success step when initialSuccess is true", () => {
			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} initialSuccess={true} />
				</TestWrapper>,
			);

			expect(screen.getByText("All Set!")).toBeDefined();
			expect(screen.getByText("Go to Dashboard")).toBeDefined();
		});

		it("should call onComplete when clicking Go to Dashboard", () => {
			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} initialSuccess={true} />
				</TestWrapper>,
			);

			const finishButton = screen.getByText("Go to Dashboard");
			fireEvent.click(finishButton);

			expect(mockOnComplete).toHaveBeenCalled();
		});

		it("should transition to success step when initialSuccess changes from false to true", async () => {
			const { rerender } = render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} initialSuccess={false} />
				</TestWrapper>,
			);

			// Should show welcome step initially
			await waitFor(() => {
				expect(screen.getByText("Welcome to Jolli!")).toBeDefined();
			});

			// Update prop to true
			rerender(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} initialSuccess={true} />
				</TestWrapper>,
			);

			// Should now show success step
			await waitFor(() => {
				expect(screen.getByText("All Set!")).toBeDefined();
			});
		});
	});

	describe("Integration Flow Step", () => {
		// Helper to click the GitHub card to enter integration flow
		async function clickGitHubCard() {
			await waitFor(() => {
				expect(screen.getByText("GitHub")).toBeDefined();
			});
			const githubCard = screen.getByText("GitHub").closest("button");
			expect(githubCard).not.toBeNull();
			fireEvent.click(githubCard as HTMLElement);
		}

		it("should show loading state while setting up GitHub redirect", async () => {
			const slowPromise = new Promise(() => {
				// Never resolves during test
			});
			mockClient.github.mockReturnValue({
				setupGitHubRedirect: vi.fn().mockReturnValue(slowPromise),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await clickGitHubCard();

			await waitFor(() => {
				expect(screen.getByText("Redirecting to GitHub...")).toBeDefined();
			});
		});

		it("should show error when setupGitHubRedirect returns error", async () => {
			mockClient.github.mockReturnValue({
				setupGitHubRedirect: vi.fn().mockResolvedValue({
					error: "GitHub App not configured",
				}),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await clickGitHubCard();

			await waitFor(() => {
				expect(screen.getByText("GitHub App not configured")).toBeDefined();
			});

			expect(screen.getByText("Go Back")).toBeDefined();
		});

		it("should show error when setupGitHubRedirect returns no redirectUrl", async () => {
			mockClient.github.mockReturnValue({
				setupGitHubRedirect: vi.fn().mockResolvedValue({}),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await clickGitHubCard();

			await waitFor(() => {
				expect(screen.getByText("Failed to get installation URL")).toBeDefined();
			});
		});

		it("should show error when setupGitHubRedirect throws Error", async () => {
			mockClient.github.mockReturnValue({
				setupGitHubRedirect: vi.fn().mockRejectedValue(new Error("Network error")),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await clickGitHubCard();

			await waitFor(() => {
				expect(screen.getByText("Network error")).toBeDefined();
			});
		});

		it("should show generic error when setupGitHubRedirect throws non-Error", async () => {
			mockClient.github.mockReturnValue({
				setupGitHubRedirect: vi.fn().mockRejectedValue("Something went wrong"),
			});

			render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} />
				</TestWrapper>,
			);

			await clickGitHubCard();

			await waitFor(() => {
				expect(screen.getByText("Failed to setup GitHub integration")).toBeDefined();
			});
		});

		it("should transition to success step when integration completes", async () => {
			// Mock successful redirect followed by returning to success state
			mockClient.github.mockReturnValue({
				setupGitHubRedirect: vi.fn().mockResolvedValue({
					redirectUrl: "https://github.com/apps/jolli/installations/new",
				}),
			});

			const { rerender } = render(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} initialSuccess={false} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("GitHub")).toBeDefined();
			});

			// Simulate completing the flow by changing initialSuccess
			rerender(
				<TestWrapper>
					<IntegrationSetup onComplete={mockOnComplete} initialSuccess={true} />
				</TestWrapper>,
			);

			await waitFor(() => {
				expect(screen.getByText("All Set!")).toBeDefined();
			});
		});
	});
});
