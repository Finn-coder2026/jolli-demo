import { ClientProvider } from "../../../contexts/ClientContext";
import { DevToolsProvider } from "../../../contexts/DevToolsContext";
import { NavigationProvider } from "../../../contexts/NavigationContext";
import { PermissionProvider } from "../../../contexts/PermissionContext";
import { RouterProvider } from "../../../contexts/RouterContext";
import { JobsRunningList } from "./JobsRunningList";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { JobEvent, JobExecution } from "jolli-common";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock APIs
const mockGetDashboardActiveJobs = vi.fn();
const mockGetJobExecution = vi.fn();
const mockDismissJob = vi.fn();
const mockPinJob = vi.fn();
const mockUnpinJob = vi.fn();

const mockJobsApi = {
	getDashboardActiveJobs: mockGetDashboardActiveJobs,
	getJobExecution: mockGetJobExecution,
	getJobHistory: vi.fn(),
	dismissJob: mockDismissJob,
	pinJob: mockPinJob,
	unpinJob: mockUnpinJob,
};

const mockClient = {
	jobs: vi.fn(() => mockJobsApi),
	roles: vi.fn(() => ({
		getCurrentUserPermissions: vi.fn().mockResolvedValue({
			role: {
				id: 1,
				name: "Member",
				slug: "member",
				description: null,
				isBuiltIn: true,
				isDefault: true,
				priority: 50,
				clonedFrom: null,
				createdAt: "2024-01-01T00:00:00.000Z",
				updatedAt: "2024-01-01T00:00:00.000Z",
				permissions: [],
			},
			permissions: ["users.view"],
		}),
	})),
};

// Registry to track EventSource instance for job events
let jobsEventSource: EventTarget | null = null;

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
		// Mock createMercureClient to always return Mercure disabled (tests use SSE fallback)
		createMercureClient: () => ({
			isEnabled: () => Promise.resolve(false),
			subscribe: vi.fn(),
		}),
		// Mock createResilientEventSource to return an EventTarget with close method for tests
		createResilientEventSource: (url: string) => {
			const eventTarget = new EventTarget() as EventTarget & { close: () => void };
			eventTarget.close = () => {
				/* no-op for test mock */
			};
			if (url.includes("/jobs/events")) {
				jobsEventSource = eventTarget;
			}
			return eventTarget;
		},
	};
});

// Wrapper component for tests
function TestWrapper({ children }: { children: ReactElement }): ReactElement {
	return (
		<ClientProvider>
			<RouterProvider initialPath="/">
				<DevToolsProvider>
					<PermissionProvider>
						<NavigationProvider pathname="/">{children}</NavigationProvider>
					</PermissionProvider>
				</DevToolsProvider>
			</RouterProvider>
		</ClientProvider>
	);
}

describe("JobsRunningList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		jobsEventSource = null;

		// The global smart mock in Vitest.tsx handles useIntlayer automatically

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockDismissJob.mockResolvedValue(undefined);
		mockPinJob.mockResolvedValue(undefined);
		mockUnpinJob.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
	});

	async function waitForEventSource(): Promise<void> {
		// Wait for the EventSource to be created (async SSE setup)
		for (let i = 0; i < 50; i++) {
			if (jobsEventSource) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 10));
		}
	}

	async function triggerEvent(event: JobEvent): Promise<void> {
		await waitForEventSource();
		if (jobsEventSource) {
			// Create a CustomEvent with detail.data to match resilient EventSource behavior
			const customEvent = new CustomEvent("message", {
				detail: { data: JSON.stringify(event) },
			});
			jobsEventSource.dispatchEvent(customEvent);
		}
	}

	async function triggerError(_error: Error): Promise<void> {
		await waitForEventSource();
		if (jobsEventSource) {
			const failEvent = new CustomEvent("reconnection_failed");
			jobsEventSource.dispatchEvent(failEvent);
		}
	}

	it("should render nothing while loading", () => {
		mockGetDashboardActiveJobs.mockImplementation(
			() =>
				new Promise(() => {
					// Never resolves
				}),
		);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// During loading, component should render null
		expect(container.firstChild).toBeNull();
	});

	it("should render nothing when no jobs", async () => {
		mockGetDashboardActiveJobs.mockResolvedValue([]);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(container.firstChild).toBeNull();
		});
	});

	it("should render active jobs", async () => {
		const mockJobs: Array<JobExecution> = [
			{
				id: "job-1",
				name: "generate-docsite",
				title: "Generating Documentation Site",
				params: {},
				status: "active",
				startedAt: new Date(),
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			},
		];

		mockGetDashboardActiveJobs.mockResolvedValue(mockJobs);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-1")).toBeDefined();
		});
	});

	it("should add job when job:started event received", async () => {
		const mockJob: JobExecution = {
			id: "job-2",
			name: "sync-repositories",
			title: "Syncing GitHub Repositories",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.queryByTestId("job-card-job-2")).toBeNull();
		});

		// Trigger job:started event
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-2",
				name: "sync-repositories",
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-2")).toBeDefined();
		});
	});

	it("should remove job when job:completed event received", async () => {
		const mockJob: JobExecution = {
			id: "job-3",
			name: "process-articles",
			title: "Processing Documentation Articles",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-3")).toBeDefined();
		});

		// Trigger job:completed event
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-3",
				name: "process-articles",
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		await waitFor(() => {
			expect(screen.queryByTestId("job-card-job-3")).toBeNull();
		});
	});

	it("should update job stats when job:stats-updated event received", async () => {
		const mockJob: JobExecution = {
			id: "job-4",
			name: "analyze-codebase",
			title: "Analyzing Codebase Structure",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-4")).toBeDefined();
		});

		// Trigger job:stats-updated event
		act(() => {
			const event: JobEvent = {
				type: "job:stats-updated",
				jobId: "job-4",
				name: "analyze-codebase",
				stats: { progress: 50 },
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Stats should be rendered
		await waitFor(() => {
			expect(screen.getByText("Progress")).toBeDefined();
			expect(screen.getByText("50%")).toBeDefined();
		});
	});

	it("should handle job:failed event", async () => {
		const mockJob: JobExecution = {
			id: "job-5",
			name: "build-documentation",
			title: "Building Documentation",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-5")).toBeDefined();
		});

		// Trigger job:failed event
		act(() => {
			const event: JobEvent = {
				type: "job:failed",
				jobId: "job-5",
				name: "build-documentation",
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		await waitFor(() => {
			expect(screen.queryByTestId("job-card-job-5")).toBeNull();
		});
	});

	it("should handle job:cancelled event", async () => {
		const mockJob: JobExecution = {
			id: "job-6",
			name: "import-external-docs",
			title: "Importing External Documentation",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-6")).toBeDefined();
		});

		// Trigger job:cancelled event
		act(() => {
			const event: JobEvent = {
				type: "job:cancelled",
				jobId: "job-6",
				name: "import-external-docs",
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		await waitFor(() => {
			expect(screen.queryByTestId("job-card-job-6")).toBeNull();
		});
	});

	it("should not add duplicate jobs", async () => {
		const mockJob: JobExecution = {
			id: "job-7",
			name: "validate-links",
			title: "Validating Documentation Links",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-7")).toBeDefined();
		});

		// Trigger job:started event for existing job
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-7",
				name: "validate-links",
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		// Should still only have one instance
		const cards = container.querySelectorAll('[data-testid^="job-card-"]');
		expect(cards.length).toBe(1);
	});

	it("should handle error when fetching job details fails", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error output in tests
		});

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockRejectedValue(new Error("Network error"));

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.queryByTestId("job-card-job-8")).toBeNull();
		});

		// Trigger job:started event
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-8",
				name: "generate-api-docs",
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		// Job should not be added and error should be logged
		await waitFor(() => {
			expect(consoleSpy).toHaveBeenCalledWith("Failed to load job details:", expect.any(Error));
		});

		consoleSpy.mockRestore();
	});

	it("should handle SSE errors", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error output in tests
		});

		mockGetDashboardActiveJobs.mockResolvedValue([]);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Trigger SSE error
		await act(async () => {
			await triggerError(new Error("SSE connection failed"));
		});

		// Error should be logged
		expect(consoleSpy).toHaveBeenCalledWith("SSE error:", expect.any(Error));

		consoleSpy.mockRestore();
	});

	it("should keep job visible after completion when keepCardAfterCompletion is true", async () => {
		const mockJob: JobExecution = {
			id: "job-9",
			name: "export-metrics",
			title: "Exporting Usage Metrics",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-9",
				name: "export-metrics",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-9")).toBeDefined();
		});

		// Trigger job:completed event
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-9",
				name: "export-metrics",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should still be visible after completion
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-9")).toBeDefined();
		});
	});

	it("should remove job after completion when keepCardAfterCompletion is false", async () => {
		const mockJob: JobExecution = {
			id: "job-10",
			name: "cleanup-temp-files",
			title: "Cleaning Up Temporary Files",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job without keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-10",
				name: "cleanup-temp-files",
				showInDashboard: true,
				keepCardAfterCompletion: false,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-10")).toBeDefined();
		});

		// Trigger job:completed event
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-10",
				name: "cleanup-temp-files",
				showInDashboard: true,
				keepCardAfterCompletion: false,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should be removed after completion
		await waitFor(() => {
			expect(screen.queryByTestId("job-card-job-10")).toBeNull();
		});
	});

	it("should keep job visible after failure when keepCardAfterCompletion is true", async () => {
		const mockJob: JobExecution = {
			id: "job-11",
			name: "deploy-site",
			title: "Deploying Documentation Site",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-11",
				name: "deploy-site",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-11")).toBeDefined();
		});

		// Trigger job:failed event
		act(() => {
			const event: JobEvent = {
				type: "job:failed",
				jobId: "job-11",
				name: "deploy-site",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				error: "Test error",
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should still be visible after failure
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-11")).toBeDefined();
		});
	});

	it("should update status for initially loaded jobs when they complete with keepCardAfterCompletion", async () => {
		const mockJob: JobExecution = {
			id: "job-12",
			name: "index-search",
			title: "Indexing Search Content",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-12")).toBeDefined();
		});

		// Mark this job as keepCardAfterCompletion via a started event
		act(() => {
			triggerEvent({
				type: "job:started",
				jobId: "job-12",
				name: "index-search",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			});
		});

		// Complete the job
		act(() => {
			triggerEvent({
				type: "job:completed",
				jobId: "job-12",
				name: "index-search",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			});
		});

		// Job should still be visible (not removed)
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-12")).toBeDefined();
			// Should have green border for completed
			const card = container.querySelector(".border-green-200");
			expect(card).toBeDefined();
		});
	});

	it("should handle stats update for non-matching job", async () => {
		const mockJob: JobExecution = {
			id: "job-13",
			name: "compile-assets",
			title: "Compiling Static Assets",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-13")).toBeDefined();
		});

		// Trigger stats update for a different job (not in list)
		act(() => {
			triggerEvent({
				type: "job:stats-updated",
				jobId: "different-job-id",
				name: "different-job",
				stats: { progress: 75 },
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			});
		});

		// Original job should still be there unchanged
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-13")).toBeDefined();
		});
	});

	it("should handle status update for non-matching job", async () => {
		const mockJob: JobExecution = {
			id: "job-15",
			name: "optimize-images",
			title: "Optimizing Image Assets",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-15")).toBeDefined();
		});

		// Trigger completion for a different job (not in list)
		act(() => {
			triggerEvent({
				type: "job:completed",
				jobId: "different-job-id",
				name: "different-job",
				showInDashboard: true,
				timestamp: new Date().toISOString(),
			});
		});

		// Original job should still be there unchanged
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-15")).toBeDefined();
		});
	});

	it("should handle dismiss button click on completed job", async () => {
		const mockJob: JobExecution = {
			id: "job-14",
			name: "backup-data",
			title: "Backing Up Data",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-14",
				name: "backup-data",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-14")).toBeDefined();
		});

		// Complete the job
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-14",
				name: "backup-data",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should still be visible with dismiss button
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-14")).toBeDefined();
			const dismissButton = container.querySelector('button[aria-label="Dismiss job"]');
			expect(dismissButton).toBeDefined();
		});

		// Click dismiss button
		const dismissButton = container.querySelector('button[aria-label="Dismiss job"]');
		fireEvent.click(dismissButton as Element);

		// Job should be removed
		await waitFor(() => {
			expect(screen.queryByTestId("job-card-job-14")).toBeNull();
		});
	});

	it("should handle job:cancelled event and keep job visible if keepCardAfterCompletion is true", async () => {
		const mockJob: JobExecution = {
			id: "job-16",
			name: "refresh-cache",
			title: "Refreshing Cache",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-16",
				name: "refresh-cache",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-16")).toBeDefined();
		});

		// Trigger job:cancelled event
		act(() => {
			const event: JobEvent = {
				type: "job:cancelled",
				jobId: "job-16",
				name: "refresh-cache",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should still be visible after cancellation
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-16")).toBeDefined();
		});
	});

	it("should handle job:completed event with multiple jobs where only one has keepCardAfterCompletion", async () => {
		const job1: JobExecution = {
			id: "job-1",
			name: "migrate-database",
			title: "Migrating Database Schema",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		const job2: JobExecution = {
			id: "job-2",
			name: "seed-data",
			title: "Seeding Test Data",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockImplementation((jobId: string) => {
			if (jobId === "job-1") {
				return Promise.resolve(job1);
			}
			if (jobId === "job-2") {
				return Promise.resolve(job2);
			}
			return Promise.reject(new Error("Job not found"));
		});

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start job-1 with keepCardAfterCompletion
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-1",
				name: "migrate-database",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		// Start job-2 without keepCardAfterCompletion
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-2",
				name: "seed-data",
				showInDashboard: true,
				keepCardAfterCompletion: false,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		// Wait for both jobs to be loaded
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-1")).toBeDefined();
			expect(screen.getByTestId("job-card-job-2")).toBeDefined();
		});

		// Complete job-1 (should stay visible)
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-1",
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// job-1 should stay visible, job-2 unchanged (tests line 109 - return j for non-matching jobs)
		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-1")).toBeDefined();
			expect(screen.getByTestId("job-card-job-2")).toBeDefined();
		});
	});

	it("should include completionInfo when job completes", async () => {
		const mockJob: JobExecution = {
			id: "job-17",
			name: "publish-release",
			title: "Publishing New Release",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);

		render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-17",
				name: "publish-release",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByTestId("job-card-job-17")).toBeDefined();
		});

		// Trigger job:completed event with completionInfo
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-17",
				name: "publish-release",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				completionInfo: {
					message: "Job finished successfully. Click to view results.",
					linkType: "articles-tab",
				},
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Completion info should be displayed
		await waitFor(() => {
			expect(screen.getByText("Job finished successfully. Click to view results.")).toBeDefined();
			expect(screen.getByText("View")).toBeDefined();
		});
	});

	it("should handle pin button click to pin a job", async () => {
		const mockJob: JobExecution = {
			id: "job-17",
			name: "pinnable-job",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);
		mockPinJob.mockResolvedValue(undefined);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-17",
				name: "pinnable-job",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByText("pinnable-job")).toBeDefined();
		});

		// Complete the job
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-17",
				name: "pinnable-job",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should still be visible with pin button
		await waitFor(() => {
			expect(screen.getByText("pinnable-job")).toBeDefined();
			const pinButton = container.querySelector('button[aria-label="Pin job"]');
			expect(pinButton).toBeDefined();
		});

		// Click pin button
		const pinButton = container.querySelector('button[aria-label="Pin job"]');
		await act(() => {
			pinButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Job should now be pinned (button aria-label should change)
		await waitFor(() => {
			const unpinButton = container.querySelector('button[aria-label="Unpin job"]');
			expect(unpinButton).toBeDefined();
		});
	});

	it("should handle pin button click to unpin a job", async () => {
		const mockJob: JobExecution = {
			id: "job-18",
			name: "pinned-job",
			params: {},
			status: "completed",
			startedAt: new Date(),
			completedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
			isPinned: true,
			pinnedAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);
		mockUnpinJob.mockResolvedValue(undefined);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Wait for initial load with pinned job
		await waitFor(() => {
			expect(screen.getByText("pinned-job")).toBeDefined();
			const unpinButton = container.querySelector('button[aria-label="Unpin job"]');
			expect(unpinButton).toBeDefined();
		});

		// Click unpin button
		const unpinButton = container.querySelector('button[aria-label="Unpin job"]');
		await act(() => {
			unpinButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Job should now be unpinned (button aria-label should change)
		await waitFor(() => {
			const pinButton = container.querySelector('button[aria-label="Pin job"]');
			expect(pinButton).toBeDefined();
		});
	});

	it("should handle pin API failure gracefully", async () => {
		const mockJob: JobExecution = {
			id: "job-19",
			name: "pin-fail-job",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress console.error in test
		});

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);
		mockPinJob.mockRejectedValue(new Error("Failed to pin job"));

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-19",
				name: "pin-fail-job",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByText("pin-fail-job")).toBeDefined();
		});

		// Complete the job
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-19",
				name: "pin-fail-job",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should still be visible with pin button
		await waitFor(() => {
			expect(screen.getByText("pin-fail-job")).toBeDefined();
			const pinButton = container.querySelector('button[aria-label="Pin job"]');
			expect(pinButton).toBeDefined();
		});

		// Click pin button (will fail)
		const pinButton = container.querySelector('button[aria-label="Pin job"]');
		await act(() => {
			pinButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Error should be logged
		await waitFor(() => {
			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to toggle pin:", expect.any(Error));
		});

		consoleErrorSpy.mockRestore();
	});

	it("should handle dismiss API failure gracefully", async () => {
		const mockJob: JobExecution = {
			id: "job-20",
			name: "dismiss-fail-job",
			params: {},
			status: "active",
			startedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress console.error in test
		});

		mockGetDashboardActiveJobs.mockResolvedValue([]);
		mockGetJobExecution.mockResolvedValue(mockJob);
		mockDismissJob.mockRejectedValue(new Error("Failed to dismiss job"));

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Start the job with keepCardAfterCompletion flag
		await act(async () => {
			const event: JobEvent = {
				type: "job:started",
				jobId: "job-20",
				name: "dismiss-fail-job",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(screen.getByText("dismiss-fail-job")).toBeDefined();
		});

		// Complete the job
		act(() => {
			const event: JobEvent = {
				type: "job:completed",
				jobId: "job-20",
				name: "dismiss-fail-job",
				showInDashboard: true,
				keepCardAfterCompletion: true,
				timestamp: new Date().toISOString(),
			};
			triggerEvent(event);
		});

		// Job should still be visible with dismiss button
		await waitFor(() => {
			expect(screen.getByText("dismiss-fail-job")).toBeDefined();
			const dismissButton = container.querySelector('button[aria-label="Dismiss job"]');
			expect(dismissButton).toBeDefined();
		});

		// Click dismiss button (will fail)
		const dismissButton = container.querySelector('button[aria-label="Dismiss job"]');
		await act(() => {
			dismissButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Error should be logged, but job should still be visible
		await waitFor(() => {
			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to dismiss job:", expect.any(Error));
			expect(screen.getByText("dismiss-fail-job")).toBeDefined();
		});

		consoleErrorSpy.mockRestore();
	});

	it("should handle pin toggle with multiple jobs (testing return j path)", async () => {
		const job1: JobExecution = {
			id: "job-21",
			name: "first-completed-job",
			params: {},
			status: "completed",
			startedAt: new Date(),
			completedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		const job2: JobExecution = {
			id: "job-22",
			name: "second-completed-job",
			params: {},
			status: "completed",
			startedAt: new Date(),
			completedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([job1, job2]);
		mockPinJob.mockResolvedValue(undefined);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Wait for both jobs to be loaded
		await waitFor(() => {
			expect(screen.getByText("first-completed-job")).toBeDefined();
			expect(screen.getByText("second-completed-job")).toBeDefined();
		});

		// Find the pin button for the first job and click it
		const cards = container.querySelectorAll('[class*="border-green"]');
		expect(cards.length).toBe(2);

		// Find all pin buttons (there should be 2)
		const pinButtons = container.querySelectorAll('button[aria-label="Pin job"]');
		expect(pinButtons.length).toBe(2);

		// Click the first pin button
		await act(() => {
			pinButtons[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// First job should be pinned, second should remain unchanged (tests line 148)
		await waitFor(() => {
			const unpinButton = container.querySelector('button[aria-label="Unpin job"]');
			expect(unpinButton).toBeDefined();
			// Second job should still have pin button
			const remainingPinButtons = container.querySelectorAll('button[aria-label="Pin job"]');
			expect(remainingPinButtons.length).toBe(1);
		});
	});

	it("should handle pin toggle when job is removed during execution", async () => {
		const mockJob: JobExecution = {
			id: "job-23",
			name: "race-condition-job",
			params: {},
			status: "completed",
			startedAt: new Date(),
			completedAt: new Date(),
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		mockGetDashboardActiveJobs.mockResolvedValue([mockJob]);
		// Delayed response to allow state changes
		mockPinJob.mockImplementation(
			() =>
				new Promise(resolve =>
					setTimeout(() => {
						resolve(undefined);
					}, 10),
				),
		);
		// Immediate response to remove job quickly
		mockDismissJob.mockResolvedValue(undefined);

		const { container } = render(
			<TestWrapper>
				<JobsRunningList />
			</TestWrapper>,
		);

		// Wait for job to be loaded
		await waitFor(() => {
			expect(screen.getByText("race-condition-job")).toBeDefined();
		});

		// Get button references
		const pinButton = container.querySelector('button[aria-label="Pin job"]');
		const dismissButton = container.querySelector('button[aria-label="Dismiss job"]');

		expect(pinButton).toBeDefined();
		expect(dismissButton).toBeDefined();

		// Try to create a race condition by clicking pin and dismiss almost simultaneously
		// The dismiss should remove the job from state before pin handler's API call completes
		act(() => {
			// Click pin button (starts async handler)
			pinButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			// Immediately click dismiss (removes job from state)
			dismissButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Wait for both operations to settle
		await waitFor(
			() => {
				expect(screen.queryByText("race-condition-job")).toBeNull();
			},
			{ timeout: 200 },
		);

		// No errors should occur even if there was a race condition
	});
});
