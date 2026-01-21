import type { JobClient } from "./JobClient";
import { vi } from "vitest";

export function mockJobClient(partial?: Partial<JobClient>): JobClient {
	return {
		listJobs: vi.fn().mockResolvedValue([]),
		queueJob: vi.fn().mockResolvedValue({ jobId: "test-id", name: "test-job", message: "Job queued" }),
		getJobHistory: vi.fn().mockResolvedValue([]),
		getJobExecution: vi.fn().mockResolvedValue(undefined),
		cancelJob: vi.fn().mockResolvedValue(undefined),
		retryJob: vi.fn().mockResolvedValue({ jobId: "test-id", name: "test-job", message: "Job queued" }),
		getJobStats: vi.fn().mockResolvedValue({ activeCount: 0, completedCount: 0, failedCount: 0, totalRetries: 0 }),
		getDashboardActiveJobs: vi.fn().mockResolvedValue([]),
		pinJob: vi.fn().mockResolvedValue(undefined),
		unpinJob: vi.fn().mockResolvedValue(undefined),
		dismissJob: vi.fn().mockResolvedValue(undefined),
		subscribeToJobEvents: vi.fn().mockReturnValue(() => {
			// Mock unsubscribe function
		}),
		...partial,
	};
}
