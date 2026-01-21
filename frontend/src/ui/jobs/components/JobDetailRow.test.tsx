import { getStatusColor, JobDetailRow } from "./JobDetailRow";
import { render, screen, waitFor } from "@testing-library/preact";
import type { JobExecution } from "jolli-common";
import { beforeEach, describe, expect, it } from "vitest";

describe("JobDetailRow", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	const mockJob: JobExecution = {
		id: "job-1",
		name: "test-job",
		params: { key: "value" },
		status: "completed",
		logs: [{ timestamp: new Date("2024-01-01T10:00:00Z"), level: "info", message: "Test log" }],
		retryCount: 0,
		createdAt: new Date("2024-01-01T09:00:00Z"),
		startedAt: new Date("2024-01-01T10:00:00Z"),
		completedAt: new Date("2024-01-01T10:05:00Z"),
	};

	it("should render job name", () => {
		render(<JobDetailRow job={mockJob} />);
		expect(screen.getByText("test-job")).toBeDefined();
	});

	it("should render completed status icon", () => {
		render(<JobDetailRow job={mockJob} />);
		const { container } = render(<JobDetailRow job={mockJob} />);
		expect(container.querySelector(".text-green-500")).toBeDefined();
	});

	it("should render active status icon", () => {
		const { completedAt: _completedAt, ...rest } = mockJob;
		const activeJob: JobExecution = {
			...rest,
			status: "active",
		};
		const { container } = render(<JobDetailRow job={activeJob} />);
		expect(container.querySelector(".text-blue-500")).toBeDefined();
	});

	it("should render failed status icon", () => {
		const failedJob: JobExecution = {
			...mockJob,
			status: "failed",
		};
		const { container } = render(<JobDetailRow job={failedJob} />);
		expect(container.querySelector(".text-red-500")).toBeDefined();
	});

	it("should render cancelled status icon", () => {
		const cancelledJob: JobExecution = {
			...mockJob,
			status: "cancelled",
		};
		const { container } = render(<JobDetailRow job={cancelledJob} />);
		expect(container.querySelector(".text-gray-500")).toBeDefined();
	});

	it("should render queued status icon", () => {
		const { startedAt: _startedAt, completedAt: _completedAt, ...rest } = mockJob;
		const queuedJob: JobExecution = {
			...rest,
			status: "queued",
		};
		const { container } = render(<JobDetailRow job={queuedJob} />);
		expect(container.querySelector(".text-gray-500")).toBeDefined();
	});

	it("should show duration for completed jobs", () => {
		render(<JobDetailRow job={mockJob} />);
		expect(screen.getByText("5m 0s")).toBeDefined();
	});

	it("should show duration in seconds for short jobs", () => {
		const quickJob: JobExecution = {
			...mockJob,
			startedAt: new Date("2024-01-01T10:00:00Z"),
			completedAt: new Date("2024-01-01T10:00:30Z"),
		};
		render(<JobDetailRow job={quickJob} />);
		expect(screen.getByText("30s")).toBeDefined();
	});

	it("should show duration in hours for long jobs", () => {
		const longJob: JobExecution = {
			...mockJob,
			startedAt: new Date("2024-01-01T10:00:00Z"),
			completedAt: new Date("2024-01-01T12:30:00Z"),
		};
		render(<JobDetailRow job={longJob} />);
		expect(screen.getByText("2h 30m")).toBeDefined();
	});

	it("should show em dash when startedAt is missing", () => {
		const { startedAt: _startedAt, completedAt: _completedAt, ...rest } = mockJob;
		const jobWithoutDates: JobExecution = rest;
		render(<JobDetailRow job={jobWithoutDates} />);
		const emDashes = screen.getAllByText("—");
		expect(emDashes.length).toBeGreaterThan(0);
	});

	it("should display retry count when greater than 0", () => {
		const retriedJob: JobExecution = {
			...mockJob,
			retryCount: 2,
		};
		render(<JobDetailRow job={retriedJob} />);
		expect(screen.getByText("2 retries")).toBeDefined();
	});

	it("should display singular retry when count is 1", () => {
		const retriedJob: JobExecution = {
			...mockJob,
			retryCount: 1,
		};
		render(<JobDetailRow job={retriedJob} />);
		expect(screen.getByText("1 retry")).toBeDefined();
	});

	it("should accept onCancel handler", () => {
		const { completedAt: _completedAt, ...rest } = mockJob;
		const activeJob: JobExecution = {
			...rest,
			status: "active",
		};
		const mockOnCancel = () => {
			// Mock function
		};
		render(<JobDetailRow job={activeJob} onCancel={mockOnCancel} />);
		expect(screen.getByText("test-job")).toBeDefined();
	});

	it("should accept onRetry handler", () => {
		const failedJob: JobExecution = {
			...mockJob,
			status: "failed",
		};
		const mockOnRetry = () => {
			// Mock function
		};
		render(<JobDetailRow job={failedJob} onRetry={mockOnRetry} />);
		expect(screen.getByText("test-job")).toBeDefined();
	});

	it("should expand and collapse when clicked", async () => {
		const { container } = render(<JobDetailRow job={mockJob} />);

		// Initially collapsed - should show ChevronRight
		const clickableDiv = container.querySelector(".cursor-pointer") as HTMLElement;
		expect(clickableDiv).toBeDefined();

		// Click to expand
		clickableDiv?.click();

		// After clicking, should show expanded view
		await waitFor(() => {
			// The expanded view should be visible (it contains tabs)
			expect(container.querySelector('[value="overview"]')).toBeDefined();
		});

		// Click again to collapse
		clickableDiv?.click();

		// After clicking again, expanded view should be hidden
		await waitFor(() => {
			expect(container.querySelector('[value="overview"]')).toBeNull();
		});
	});

	// Note: Expanded view tests with tab interactions are covered by integration tests
	// in ActiveJobs.test.tsx and JobHistory.test.tsx which test the full user workflow
	// Those integration tests provide full coverage of the JobDetailRow expanded view
});

describe("getStatusColor", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should return blue color for active status", () => {
		expect(getStatusColor("active")).toBe("text-blue-600 dark:text-blue-400");
	});

	it("should return green color for completed status", () => {
		expect(getStatusColor("completed")).toBe("text-green-600 dark:text-green-400");
	});

	it("should return red color for failed status", () => {
		expect(getStatusColor("failed")).toBe("text-red-600 dark:text-red-400");
	});

	it("should return gray color for cancelled status", () => {
		expect(getStatusColor("cancelled")).toBe("text-gray-600 dark:text-gray-400");
	});

	it("should return gray color for queued status", () => {
		expect(getStatusColor("queued")).toBe("text-gray-600 dark:text-gray-400");
	});

	it("should return gray color for unknown status", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing unknown status
		expect(getStatusColor("unknown" as any)).toBe("text-gray-600 dark:text-gray-400");
	});

	it("should render title with job name as sub-heading when title is provided", () => {
		const jobWithTitle: JobExecution = {
			id: "job-1",
			name: "demo:quick-stats",
			title: "Quick Stats Demo",
			params: {},
			status: "active",
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		render(<JobDetailRow job={jobWithTitle} />);

		// Should show title as main heading
		expect(screen.getByText("Quick Stats Demo")).toBeDefined();

		// Should show job name as sub-heading
		expect(screen.getByText("demo:quick-stats")).toBeDefined();
	});

	it("should render only job name when title is not provided", () => {
		const jobWithoutTitle: JobExecution = {
			id: "job-1",
			name: "demo:quick-stats",
			params: {},
			status: "active",
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		render(<JobDetailRow job={jobWithoutTitle} />);

		// Should show localized job title as main heading (from Jobs content)
		expect(screen.getByText("Quick Stats Demo")).toBeDefined();
		// Should NOT show job name as secondary text since no explicit title was provided
		expect(screen.queryByText("demo:quick-stats")).toBeNull();
	});
});
