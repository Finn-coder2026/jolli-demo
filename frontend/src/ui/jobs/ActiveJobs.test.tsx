import { ClientProvider } from "../../contexts/ClientContext";
import { RouterProvider } from "../../contexts/RouterContext";
import { ActiveJobs, cancelJobWithErrorHandling, loadActiveJobs } from "./ActiveJobs";
import { act, render, screen, waitFor } from "@testing-library/preact";
import type { JobExecution } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockJobs: Array<JobExecution> = [
	{
		id: "job-1",
		name: "test-job",
		params: {},
		status: "active",
		logs: [],
		retryCount: 0,
		createdAt: new Date("2024-01-01T00:00:00Z"),
	},
];

const mockGetJobHistory = vi.fn();
const mockCancelJob = vi.fn();
const mockGetJobExecution = vi.fn();

const mockJobsApi = {
	getJobHistory: mockGetJobHistory,
	cancelJob: mockCancelJob,
	getJobExecution: mockGetJobExecution,
};

const mockClient = {
	jobs: vi.fn(() => mockJobsApi),
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

describe("ActiveJobs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		jobsEventSource = null;
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
		mockGetJobHistory.mockResolvedValue(mockJobs);
		mockCancelJob.mockResolvedValue({});
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

	async function triggerEvent(event: unknown): Promise<void> {
		await waitForEventSource();
		if (jobsEventSource) {
			// Create a CustomEvent with detail.data to match resilient EventSource behavior
			const customEvent = new CustomEvent("message", {
				detail: { data: JSON.stringify(event) },
			});
			jobsEventSource.dispatchEvent(customEvent);
		}
	}

	async function triggerError(): Promise<void> {
		await waitForEventSource();
		if (jobsEventSource) {
			const failEvent = new CustomEvent("reconnection_failed");
			jobsEventSource.dispatchEvent(failEvent);
		}
	}

	function renderActiveJobs() {
		return render(
			<ClientProvider>
				<RouterProvider>
					<ActiveJobs />
				</RouterProvider>
			</ClientProvider>,
		);
	}

	it("should show loading state initially", () => {
		mockGetJobHistory.mockImplementation(
			() =>
				new Promise(() => {
					// Never resolves
				}),
		);

		renderActiveJobs();

		expect(screen.getByText("Loading active jobs...")).toBeDefined();
	});

	it("should render active jobs when loaded", async () => {
		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getAllByText("Active Jobs").length).toBeGreaterThan(0);
		});
	});

	it("should show empty state when no jobs", async () => {
		mockGetJobHistory.mockResolvedValue([]);

		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("No active jobs")).toBeDefined();
		});
	});

	it("should handle errors when loading jobs", async () => {
		mockGetJobHistory.mockRejectedValue(new Error("Network error"));

		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeDefined();
		});
	});

	it("should subscribe to job events", async () => {
		renderActiveJobs();

		// Wait for SSE connection to be established
		await waitForEventSource();

		expect(jobsEventSource).not.toBeNull();
	});

	it("should render refresh button", async () => {
		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("Refresh")).toBeDefined();
		});
	});

	it("should add new job when job:started event is received", async () => {
		const newJob: JobExecution = {
			id: "job-2",
			name: "new-job",
			params: {},
			status: "active",
			logs: [],
			retryCount: 0,
			createdAt: new Date("2024-01-01T00:00:00Z"),
		};

		mockGetJobExecution.mockResolvedValue(newJob);

		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Trigger job:started event via SSE
		await act(async () => {
			await triggerEvent({ type: "job:started", jobId: "job-2" });
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(mockGetJobExecution).toHaveBeenCalledWith("job-2");
			expect(screen.getByText("new-job")).toBeDefined();
		});
	});

	it("should not add duplicate job when job:started event is received for existing job", async () => {
		mockGetJobExecution.mockResolvedValue(mockJobs[0]);

		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Trigger job:started event for existing job via SSE
		await act(async () => {
			await triggerEvent({ type: "job:started", jobId: "job-1" });
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(mockGetJobExecution).toHaveBeenCalledWith("job-1");
		});

		// Should still only have one instance
		const jobElements = screen.getAllByText("test-job");
		expect(jobElements.length).toBe(1);
	});

	it("should handle error when fetching job details fails", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error output in tests
		});

		mockGetJobExecution.mockRejectedValue(new Error("Network error"));

		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Trigger job:started event via SSE
		await act(async () => {
			await triggerEvent({ type: "job:started", jobId: "job-2" });
			await new Promise(resolve => setTimeout(resolve, 50));
		});

		await waitFor(() => {
			expect(consoleSpy).toHaveBeenCalledWith("Failed to load job details:", expect.any(Error));
		});

		consoleSpy.mockRestore();
	});

	it("should remove job when job:completed event is received", async () => {
		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Trigger job:completed event via SSE
		await act(async () => {
			await triggerEvent({ type: "job:completed", jobId: "job-1" });
		});

		await waitFor(() => {
			expect(screen.queryByText("test-job")).toBeNull();
		});
	});

	it("should remove job when job:failed event is received", async () => {
		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Trigger job:failed event via SSE
		await act(async () => {
			await triggerEvent({ type: "job:failed", jobId: "job-1" });
		});

		await waitFor(() => {
			expect(screen.queryByText("test-job")).toBeNull();
		});
	});

	it("should remove job when job:cancelled event is received", async () => {
		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Trigger job:cancelled event via SSE
		await act(async () => {
			await triggerEvent({ type: "job:cancelled", jobId: "job-1" });
		});

		await waitFor(() => {
			expect(screen.queryByText("test-job")).toBeNull();
		});
	});

	it("should handle SSE errors", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error output in tests
		});

		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Trigger SSE error via reconnection_failed event
		await act(async () => {
			await triggerError();
		});

		await waitFor(() => {
			expect(consoleSpy).toHaveBeenCalledWith("SSE error:", expect.any(Error));
		});

		consoleSpy.mockRestore();
	});

	it("should handle successful job cancellation", async () => {
		mockCancelJob.mockResolvedValue({});

		const setError = vi.fn();

		await cancelJobWithErrorHandling(mockJobsApi as never, "job-1", setError, "Failed to cancel job");

		// Should call cancelJob and not set error
		expect(mockCancelJob).toHaveBeenCalledWith("job-1");
		expect(setError).not.toHaveBeenCalled();
	});

	it("should handle cancel job error and set error state", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error output in tests
		});

		mockCancelJob.mockRejectedValue(new Error("Cancel failed"));

		const setError = vi.fn();

		await cancelJobWithErrorHandling(mockJobsApi as never, "job-1", setError, "Failed to cancel job");

		// The error should be logged and setError should be called
		expect(consoleSpy).toHaveBeenCalledWith("Failed to cancel job:", expect.any(Error));
		expect(setError).toHaveBeenCalledWith("Cancel failed");

		consoleSpy.mockRestore();
	});

	it("should handle cancel job error with non-Error exception", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error output in tests
		});

		mockCancelJob.mockRejectedValue("String error");

		const setError = vi.fn();

		await cancelJobWithErrorHandling(mockJobsApi as never, "job-1", setError, "Failed to cancel job");

		// The error should be logged and setError should be called with default message
		expect(consoleSpy).toHaveBeenCalledWith("Failed to cancel job:", "String error");
		expect(setError).toHaveBeenCalledWith("Failed to cancel job");

		consoleSpy.mockRestore();
	});

	it("should handle loadJobs error with non-Error exception", async () => {
		mockGetJobHistory.mockRejectedValue("String error");

		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("Failed to load active jobs")).toBeDefined();
		});
	});

	it("should call handleCancelJob when Cancel Job button is clicked", async () => {
		mockCancelJob.mockResolvedValue({});

		const { container } = renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Expand the job detail row by clicking on it
		const expandButton = container.querySelector(".cursor-pointer");
		await act(() => {
			expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Find and click the Cancel Job button (now accessible via mock)
		await waitFor(() => {
			const cancelButton = screen.queryByText("Cancel Job");
			expect(cancelButton).toBeDefined();
		});

		const cancelButton = screen.getByText("Cancel Job");
		await act(() => {
			cancelButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Verify the cancel was called
		expect(mockCancelJob).toHaveBeenCalledWith("job-1");
	});

	it("should successfully load active jobs via loadActiveJobs", async () => {
		mockGetJobHistory.mockResolvedValue(mockJobs);

		const setLoading = vi.fn();
		const setError = vi.fn();
		const setJobs = vi.fn();

		await loadActiveJobs(mockJobsApi as never, setLoading, setError, setJobs, "Failed to load active jobs");

		// Should call setters in correct order
		expect(setLoading).toHaveBeenCalledWith(true);
		expect(setError).toHaveBeenCalledWith(null);
		expect(setJobs).toHaveBeenCalledWith(mockJobs);
		expect(setLoading).toHaveBeenCalledWith(false);
	});

	it("should handle errors in loadActiveJobs", async () => {
		mockGetJobHistory.mockRejectedValue(new Error("Load failed"));

		const setLoading = vi.fn();
		const setError = vi.fn();
		const setJobs = vi.fn();

		await loadActiveJobs(mockJobsApi as never, setLoading, setError, setJobs, "Failed to load active jobs");

		// Should call setters in correct order
		expect(setLoading).toHaveBeenCalledWith(true);
		expect(setError).toHaveBeenCalledWith(null);
		expect(setError).toHaveBeenCalledWith("Load failed");
		expect(setLoading).toHaveBeenCalledWith(false);
		expect(setJobs).not.toHaveBeenCalled();
	});

	it("should handle non-Error exceptions in loadActiveJobs", async () => {
		mockGetJobHistory.mockRejectedValue("String error");

		const setLoading = vi.fn();
		const setError = vi.fn();
		const setJobs = vi.fn();

		await loadActiveJobs(mockJobsApi as never, setLoading, setError, setJobs, "Failed to load active jobs");

		// Should call setters with default error message
		expect(setError).toHaveBeenCalledWith("Failed to load active jobs");
		expect(setLoading).toHaveBeenCalledWith(false);
	});

	it("should navigate to dashboard when Dashboard breadcrumb is clicked", async () => {
		renderActiveJobs();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Find and click the Dashboard breadcrumb button
		const dashboardButtons = screen.getAllByText("Dashboard");
		// The breadcrumb button is the first one (not in the heading)
		const breadcrumbButton = dashboardButtons.find(btn => btn.tagName === "BUTTON");
		expect(breadcrumbButton).toBeDefined();

		await act(() => {
			breadcrumbButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// The onClick was executed successfully (no errors thrown)
		// The actual navigation is tested in RouterContext tests
	});
});
