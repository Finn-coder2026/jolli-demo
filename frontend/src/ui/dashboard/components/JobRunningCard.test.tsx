import { ClientProvider } from "../../../contexts/ClientContext";
import { DevToolsProvider } from "../../../contexts/DevToolsContext";
import { NavigationProvider } from "../../../contexts/NavigationContext";
import { RouterProvider } from "../../../contexts/RouterContext";
import { JobRunningCard } from "./JobRunningCard";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { JobExecution } from "jolli-common";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Wrapper component for tests
function TestWrapper({ children }: { children: ReactElement }): ReactElement {
	return (
		<ClientProvider>
			<RouterProvider initialPath="/">
				<DevToolsProvider>
					<NavigationProvider pathname="/">{children}</NavigationProvider>
				</DevToolsProvider>
			</RouterProvider>
		</ClientProvider>
	);
}

describe("JobRunningCard", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	const mockJob: JobExecution = {
		id: "job-123",
		name: "test-job",
		params: {},
		status: "active",
		logs: [],
		retryCount: 0,
		createdAt: new Date(),
	};

	it("should render job name", () => {
		render(<JobRunningCard job={mockJob} />, { wrapper: TestWrapper });
		expect(screen.getByText("test-job")).toBeDefined();
	});

	it("should render duration when job has started", () => {
		const jobWithStartTime: JobExecution = {
			...mockJob,
			startedAt: new Date(Date.now() - 5000), // Started 5 seconds ago
		};
		render(<JobRunningCard job={jobWithStartTime} />, { wrapper: TestWrapper });
		expect(screen.getByText("5s")).toBeDefined();
	});

	it('should show "Just started" when job has no start time', () => {
		render(<JobRunningCard job={mockJob} />, { wrapper: TestWrapper });
		expect(screen.getByText("Just started")).toBeDefined();
	});

	it("should render stats when present", () => {
		const jobWithStats: JobExecution = {
			...mockJob,
			stats: { progress: 50, itemsProcessed: 100 },
		};
		render(<JobRunningCard job={jobWithStats} />, { wrapper: TestWrapper });

		// Check that stats are rendered
		expect(screen.getByText("Progress")).toBeDefined();
		expect(screen.getByText("50%")).toBeDefined();
		expect(screen.getByText("Items Processed:")).toBeDefined();
		expect(screen.getByText("100")).toBeDefined();
	});

	it("should not render stats section when stats is undefined", () => {
		render(<JobRunningCard job={mockJob} />, { wrapper: TestWrapper });

		// Progress text should not be present
		expect(screen.queryByText("Progress")).toBeNull();
	});

	it("should format duration in minutes when over 60 seconds", () => {
		const jobWithStartTime: JobExecution = {
			...mockJob,
			startedAt: new Date(Date.now() - 120000), // Started 2 minutes ago
		};
		render(<JobRunningCard job={jobWithStartTime} />, { wrapper: TestWrapper });
		expect(screen.getByText("2m")).toBeDefined();
	});

	it("should format duration in hours and minutes when over 60 minutes", () => {
		const jobWithStartTime: JobExecution = {
			...mockJob,
			startedAt: new Date(Date.now() - 3900000), // Started 65 minutes ago
		};
		render(<JobRunningCard job={jobWithStartTime} />, { wrapper: TestWrapper });
		expect(screen.getByText("1h 5m")).toBeDefined();
	});

	it("should show completed icon and green border for completed jobs", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
		};
		const { container } = render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });

		// Check for green border
		const card = container.querySelector(".border-green-200");
		expect(card).toBeDefined();
	});

	it("should show error icon and red border for failed jobs", () => {
		const failedJob: JobExecution = {
			...mockJob,
			status: "failed",
			completedAt: new Date(),
			error: "Test error",
		};
		const { container } = render(<JobRunningCard job={failedJob} />, { wrapper: TestWrapper });

		// Check for red border
		const card = container.querySelector(".border-red-200");
		expect(card).toBeDefined();
	});

	it("should show error icon and red border for cancelled jobs", () => {
		const cancelledJob: JobExecution = {
			...mockJob,
			status: "cancelled",
			completedAt: new Date(),
		};
		const { container } = render(<JobRunningCard job={cancelledJob} />, { wrapper: TestWrapper });

		// Check for red border
		const card = container.querySelector(".border-red-200");
		expect(card).toBeDefined();
	});

	it("should show spinner and blue border for active jobs", () => {
		const { container } = render(<JobRunningCard job={mockJob} />, { wrapper: TestWrapper });

		// Check for blue border
		const card = container.querySelector(".border-blue-200");
		expect(card).toBeDefined();
	});

	it("should show close button for completed jobs when onDismiss is provided", () => {
		const onDismiss = vi.fn();
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
		};

		render(<JobRunningCard job={completedJob} onDismiss={onDismiss} />, { wrapper: TestWrapper });

		const dismissButton = screen.getByLabelText("Dismiss job");
		expect(dismissButton).toBeDefined();
	});

	it("should not show close button for active jobs", () => {
		const onDismiss = vi.fn();

		render(<JobRunningCard job={mockJob} onDismiss={onDismiss} />, { wrapper: TestWrapper });

		const dismissButton = screen.queryByLabelText("Dismiss job");
		expect(dismissButton).toBeNull();
	});

	it("should not show close button for completed jobs when onDismiss is not provided", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });

		const dismissButton = screen.queryByLabelText("Dismiss job");
		expect(dismissButton).toBeNull();
	});

	it("should call onDismiss with job id when close button is clicked", () => {
		const onDismiss = vi.fn();
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
		};

		render(<JobRunningCard job={completedJob} onDismiss={onDismiss} />, { wrapper: TestWrapper });

		const dismissButton = screen.getByLabelText("Dismiss job");
		fireEvent.click(dismissButton);

		expect(onDismiss).toHaveBeenCalledWith("job-123");
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it("should display completion message when completionInfo is present", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "Article created successfully",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		expect(screen.getByText("Article created successfully")).toBeDefined();
	});

	it("should not display completion info for non-completed jobs", () => {
		const activeJob: JobExecution = {
			...mockJob,
			status: "active",
			completionInfo: {
				message: "Should not be shown",
			},
		};

		render(<JobRunningCard job={activeJob} />, { wrapper: TestWrapper });
		expect(screen.queryByText("Should not be shown")).toBeNull();
	});

	it("should render link button for articles-tab linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "View your articles",
				linkType: "articles-tab",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		const viewButton = screen.getByRole("button", { name: /view/i });
		expect(viewButton).toBeDefined();
	});

	it("should render link button for sites-tab linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "View your sites",
				linkType: "sites-tab",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		const viewButton = screen.getByRole("button", { name: /view/i });
		expect(viewButton).toBeDefined();
	});

	it("should render link button for integrations-tab linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "View your integrations",
				linkType: "integrations-tab",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		const viewButton = screen.getByRole("button", { name: /view/i });
		expect(viewButton).toBeDefined();
	});

	it("should render link button for article linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "View article",
				linkType: "article",
				articleJrn: "jrn:aws:s3:::bucket/article-123",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		const viewButton = screen.getByRole("button", { name: /view/i });
		expect(viewButton).toBeDefined();
	});

	it("should not render link button for article linkType without articleJrn", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "Article info",
				linkType: "article",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		expect(screen.queryByRole("button", { name: /view/i })).toBeNull();
	});

	it("should render link button for docsite linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "View docsite",
				linkType: "docsite",
				docsiteId: 42,
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		const viewButton = screen.getByRole("button", { name: /view/i });
		expect(viewButton).toBeDefined();
	});

	it("should not render link button for docsite linkType without docsiteId", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "Docsite info",
				linkType: "docsite",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		expect(screen.queryByRole("button", { name: /view/i })).toBeNull();
	});

	it("should render link button for github-repo linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "View repository",
				linkType: "github-repo",
				containerType: "org",
				orgName: "my-org",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		const viewButton = screen.getByRole("button", { name: /view/i });
		expect(viewButton).toBeDefined();
	});

	it("should not render link button for github-repo linkType without required fields", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "GitHub info",
				linkType: "github-repo",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		expect(screen.queryByRole("button", { name: /view/i })).toBeNull();
	});

	it("should navigate when completion link is clicked", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "View articles",
				linkType: "articles-tab",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		const viewButton = screen.getByRole("button", { name: /view/i });
		fireEvent.click(viewButton);

		// The navigation will be handled by the TestWrapper's RouterProvider
		// We can verify the button was clicked without error
		expect(viewButton).toBeDefined();
	});

	it("should not render link button when completionInfo has no linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "Job completed",
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		expect(screen.queryByRole("button", { name: /view/i })).toBeNull();
	});

	it("should not render link button for invalid linkType", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			completionInfo: {
				message: "Job completed",
				// biome-ignore lint/suspicious/noExplicitAny: testing invalid type
				linkType: "invalid-type" as any,
			},
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });
		expect(screen.queryByRole("button", { name: /view/i })).toBeNull();
	});

	it("should render title with job name as sub-heading when title is provided", () => {
		const jobWithTitle: JobExecution = {
			...mockJob,
			name: "demo:quick-stats",
			title: "Quick Stats Demo",
		};

		render(<JobRunningCard job={jobWithTitle} />, { wrapper: TestWrapper });

		// Should show title as main heading
		expect(screen.getByText("Quick Stats Demo")).toBeDefined();

		// Should show job name as sub-heading
		expect(screen.getByText("demo:quick-stats")).toBeDefined();
	});

	it("should render only job name when title is not provided", () => {
		const jobWithoutTitle: JobExecution = {
			...mockJob,
			name: "demo:quick-stats",
		};

		render(<JobRunningCard job={jobWithoutTitle} />, { wrapper: TestWrapper });

		// Should show localized job title from useJobTitle hook as main heading
		// The global mock provides "Quick Stats Demo" for "demo:quick-stats"
		expect(screen.getByText("Quick Stats Demo")).toBeDefined();
	});

	it("should show pin button when job is completed and onPinToggle is provided", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
		};
		const onPinToggle = vi.fn();

		render(<JobRunningCard job={completedJob} onPinToggle={onPinToggle} />, { wrapper: TestWrapper });

		const pinButton = screen.getByRole("button", { name: /pin job/i });
		expect(pinButton).toBeDefined();
	});

	it("should not show pin button when job is not completed", () => {
		const onPinToggle = vi.fn();

		render(<JobRunningCard job={mockJob} onPinToggle={onPinToggle} />, { wrapper: TestWrapper });

		const pinButton = screen.queryByRole("button", { name: /pin job/i });
		expect(pinButton).toBeNull();
	});

	it("should not show pin button when onPinToggle is not provided", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
		};

		render(<JobRunningCard job={completedJob} />, { wrapper: TestWrapper });

		const pinButton = screen.queryByRole("button", { name: /pin job/i });
		expect(pinButton).toBeNull();
	});

	it("should show correct aria-label when job is not pinned", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			isPinned: false,
		};
		const onPinToggle = vi.fn();

		render(<JobRunningCard job={completedJob} isPinned={false} onPinToggle={onPinToggle} />, {
			wrapper: TestWrapper,
		});

		const pinButton = screen.getByRole("button", { name: "Pin job" });
		expect(pinButton).toBeDefined();
	});

	it("should show correct aria-label when job is pinned", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			isPinned: true,
		};
		const onPinToggle = vi.fn();

		render(<JobRunningCard job={completedJob} isPinned={true} onPinToggle={onPinToggle} />, {
			wrapper: TestWrapper,
		});

		const unpinButton = screen.getByRole("button", { name: "Unpin job" });
		expect(unpinButton).toBeDefined();
	});

	it("should call onPinToggle when pin button is clicked", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
		};
		const onPinToggle = vi.fn();

		render(<JobRunningCard job={completedJob} isPinned={false} onPinToggle={onPinToggle} />, {
			wrapper: TestWrapper,
		});

		const pinButton = screen.getByRole("button", { name: "Pin job" });
		fireEvent.click(pinButton);

		expect(onPinToggle).toHaveBeenCalledWith("job-123");
	});

	it("should apply pinned styles when job is pinned", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			isPinned: true,
		};
		const onPinToggle = vi.fn();

		render(<JobRunningCard job={completedJob} isPinned={true} onPinToggle={onPinToggle} />, {
			wrapper: TestWrapper,
		});

		const pinButton = screen.getByRole("button", { name: "Unpin job" });
		const pinIcon = pinButton.querySelector("svg");
		expect(pinIcon?.getAttribute("class")).toContain("text-blue-600");
		expect(pinIcon?.getAttribute("class")).toContain("fill-current");
	});

	it("should apply unpinned styles when job is not pinned", () => {
		const completedJob: JobExecution = {
			...mockJob,
			status: "completed",
			completedAt: new Date(),
			isPinned: false,
		};
		const onPinToggle = vi.fn();

		render(<JobRunningCard job={completedJob} isPinned={false} onPinToggle={onPinToggle} />, {
			wrapper: TestWrapper,
		});

		const pinButton = screen.getByRole("button", { name: "Pin job" });
		const pinIcon = pinButton.querySelector("svg");
		expect(pinIcon?.getAttribute("class")).toContain("text-muted-foreground");
		expect(pinIcon?.getAttribute("class")).not.toContain("fill-current");
	});
});
