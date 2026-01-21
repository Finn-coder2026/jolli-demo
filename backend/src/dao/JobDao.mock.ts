import type { JobDao } from "./JobDao.js";
import { vi } from "vitest";

export function mockJobDao(partial?: Partial<JobDao>): JobDao {
	return {
		createJobExecution: vi.fn().mockResolvedValue(undefined),
		updateJobStatus: vi.fn().mockResolvedValue(undefined),
		appendLog: vi.fn().mockResolvedValue(undefined),
		getJobExecution: vi.fn().mockResolvedValue(undefined),
		listJobExecutions: vi.fn().mockResolvedValue([]),
		deleteOldExecutions: vi.fn().mockResolvedValue(0),
		deleteAllJobs: vi.fn().mockResolvedValue(undefined),
		updateStats: vi.fn().mockResolvedValue(undefined),
		updateCompletionInfo: vi.fn().mockResolvedValue(undefined),
		pinJob: vi.fn().mockResolvedValue(undefined),
		unpinJob: vi.fn().mockResolvedValue(undefined),
		dismissJob: vi.fn().mockResolvedValue(undefined),
		...partial,
	};
}
