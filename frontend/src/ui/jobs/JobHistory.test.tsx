import { ClientProvider } from "../../contexts/ClientContext";
import { RouterProvider } from "../../contexts/RouterContext";
import { JobHistory, loadJobHistory, retryJobWithErrorHandling } from "./JobHistory";
import { act, render, screen, waitFor } from "@testing-library/preact";
import type { JobExecution } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockJobs: Array<JobExecution> = [
	{
		id: "job-1",
		name: "test-job",
		params: {},
		status: "completed",
		logs: [],
		retryCount: 0,
		createdAt: new Date("2024-01-01T00:00:00Z"),
	},
];

const mockGetJobHistory = vi.fn();
const mockRetryJob = vi.fn();

const mockJobsApi = {
	getJobHistory: mockGetJobHistory,
	retryJob: mockRetryJob,
};

const mockClient = {
	jobs: vi.fn(() => mockJobsApi),
};

let currentOnValueChange: ((value: string) => void) | undefined;

vi.mock("../../components/ui/SelectBox", () => {
	return {
		SelectBox: ({
			options,
			onValueChange,
			value,
		}: {
			options: Array<{ value: string; label: string }>;
			value: string;
			onValueChange: (value: string) => void;
			width?: string;
			className?: string;
		}) => {
			currentOnValueChange = onValueChange;
			return (
				<div data-testid="selectbox-mock">
					<button type="button" data-testid="select-trigger">
						{value}
					</button>
					{options.map(option => (
						<div
							key={option.value}
							data-testid="select-item"
							data-value={option.value}
							onClick={() => currentOnValueChange?.(option.value)}
						>
							{option.label}
						</div>
					))}
				</div>
			);
		},
	};
});

vi.mock("jolli-common", async () => {
	const actual = await vi.importActual<typeof import("jolli-common")>("jolli-common");
	return {
		...actual,
		createClient: vi.fn(() => mockClient),
	};
});

describe("JobHistory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
		mockGetJobHistory.mockReset();
		mockRetryJob.mockReset();
		mockGetJobHistory.mockResolvedValue(mockJobs);
		mockRetryJob.mockResolvedValue({ jobId: "job-2", name: "test-job", message: "Retried" });
	});

	function renderJobHistory() {
		return render(
			<ClientProvider>
				<RouterProvider>
					<JobHistory />
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

		renderJobHistory();

		expect(screen.getByText("Loading job history...")).toBeDefined();
	});

	it("should render without errors", () => {
		const { container } = renderJobHistory();
		expect(container).toBeDefined();
	});

	it("should handle successful job retry", async () => {
		mockRetryJob.mockResolvedValue({ jobId: "job-2", name: "test-job", message: "Retried" });

		const onSuccess = vi.fn();

		await retryJobWithErrorHandling(mockJobsApi as never, "job-1", onSuccess);

		// Should call retryJob and onSuccess callback
		expect(mockRetryJob).toHaveBeenCalledWith("job-1");
		expect(onSuccess).toHaveBeenCalled();
	});

	it("should handle retry job error", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Suppress error output in tests
		});

		mockRetryJob.mockRejectedValue(new Error("Retry failed"));

		const onSuccess = vi.fn();

		await retryJobWithErrorHandling(mockJobsApi as never, "job-1", onSuccess);

		// The error should be logged and onSuccess should not be called
		expect(consoleSpy).toHaveBeenCalledWith("Failed to retry job:", expect.any(Error));
		expect(onSuccess).not.toHaveBeenCalled();

		consoleSpy.mockRestore();
	});

	it("should handle load jobs error with non-Error exception", async () => {
		mockGetJobHistory.mockRejectedValue("String error");

		renderJobHistory();

		await waitFor(() => {
			expect(screen.getByText("Failed to load job history")).toBeDefined();
		});
	});

	it("should call getJobHistory with status filter when initialStatusFilter is not 'all'", async () => {
		mockGetJobHistory.mockResolvedValue(mockJobs);

		render(
			<ClientProvider>
				<RouterProvider>
					<JobHistory initialStatusFilter="completed" />
				</RouterProvider>
			</ClientProvider>,
		);

		// Should call with status filter
		await waitFor(() => {
			expect(mockGetJobHistory).toHaveBeenCalledWith({ status: "completed", limit: 100 });
		});
	});

	it("should call handleRetryJob when Retry Job button is clicked", async () => {
		const failedJob: JobExecution = {
			id: "job-2",
			name: "failed-job",
			params: {},
			status: "failed",
			logs: [],
			retryCount: 0,
			createdAt: new Date("2024-01-01T00:00:00Z"),
			error: "Job failed",
		};

		mockGetJobHistory.mockResolvedValue([failedJob]);
		mockRetryJob.mockResolvedValue({ jobId: "job-3", name: "failed-job", message: "Retried" });

		const { container } = render(
			<ClientProvider>
				<RouterProvider>
					<JobHistory />
				</RouterProvider>
			</ClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByText("failed-job")).toBeDefined();
		});

		// Expand the job detail row by clicking on it
		const expandButton = container.querySelector(".cursor-pointer");
		await act(() => {
			expandButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Find and click the Retry Job button (now accessible via mock)
		await waitFor(() => {
			const retryButton = screen.queryByText("Retry Job");
			expect(retryButton).toBeDefined();
		});

		const retryButton = screen.getByText("Retry Job");
		await act(() => {
			retryButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// Verify the retry was called
		expect(mockRetryJob).toHaveBeenCalledWith("job-2");
	});

	it("should successfully load job history with 'all' filter", async () => {
		mockGetJobHistory.mockResolvedValue(mockJobs);

		const setLoading = vi.fn();
		const setError = vi.fn();
		const setJobs = vi.fn();

		await loadJobHistory(mockJobsApi as never, "all", setLoading, setError, setJobs, "Failed to load job history");

		// Should call getJobHistory without status filter
		expect(mockGetJobHistory).toHaveBeenCalledWith({ limit: 100 });
		expect(setLoading).toHaveBeenCalledWith(true);
		expect(setError).toHaveBeenCalledWith(null);
		expect(setJobs).toHaveBeenCalledWith(mockJobs);
		expect(setLoading).toHaveBeenCalledWith(false);
	});

	it("should successfully load job history with specific status filter", async () => {
		mockGetJobHistory.mockResolvedValue(mockJobs);

		const setLoading = vi.fn();
		const setError = vi.fn();
		const setJobs = vi.fn();

		await loadJobHistory(
			mockJobsApi as never,
			"completed",
			setLoading,
			setError,
			setJobs,
			"Failed to load job history",
		);

		// Should call getJobHistory with status filter
		expect(mockGetJobHistory).toHaveBeenCalledWith({ status: "completed", limit: 100 });
		expect(setJobs).toHaveBeenCalledWith(mockJobs);
	});

	it("should handle errors in loadJobHistory", async () => {
		mockGetJobHistory.mockRejectedValue(new Error("Load failed"));

		const setLoading = vi.fn();
		const setError = vi.fn();
		const setJobs = vi.fn();

		await loadJobHistory(mockJobsApi as never, "all", setLoading, setError, setJobs, "Failed to load job history");

		// Should set error message
		expect(setError).toHaveBeenCalledWith(null);
		expect(setError).toHaveBeenCalledWith("Load failed");
		expect(setLoading).toHaveBeenCalledWith(false);
		expect(setJobs).not.toHaveBeenCalled();
	});

	it("should handle non-Error exceptions in loadJobHistory", async () => {
		mockGetJobHistory.mockRejectedValue("String error");

		const setLoading = vi.fn();
		const setError = vi.fn();
		const setJobs = vi.fn();

		await loadJobHistory(mockJobsApi as never, "all", setLoading, setError, setJobs, "Failed to load job history");

		// Should set default error message
		expect(setError).toHaveBeenCalledWith("Failed to load job history");
		expect(setLoading).toHaveBeenCalledWith(false);
	});

	it("should navigate to dashboard when Dashboard breadcrumb is clicked", async () => {
		renderJobHistory();

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

	it("should update status filter when SelectBox value changes", async () => {
		mockGetJobHistory.mockResolvedValue(mockJobs);

		renderJobHistory();

		await waitFor(() => {
			expect(screen.getByText("test-job")).toBeDefined();
		});

		// Clear the initial call count
		mockGetJobHistory.mockClear();

		// Find one of the filter options and click it to trigger onValueChange
		const completedOption = screen.getAllByText("Completed").find(el => el.dataset.testid === "select-item");
		expect(completedOption).toBeDefined();

		await act(() => {
			completedOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		// The status filter change should trigger a reload with the new filter
		await waitFor(() => {
			expect(mockGetJobHistory).toHaveBeenCalledWith({ status: "completed", limit: 100 });
		});
	});
});
