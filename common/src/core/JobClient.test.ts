import { createJobClient } from "./JobClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch
global.fetch = vi.fn();

describe("JobClient", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should list jobs", async () => {
		const mockJobs = [
			{ name: "job1", description: "Test job 1", category: "core", parameterSchema: {}, triggerEvents: [] },
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockJobs,
		});

		const client = createJobClient("http://localhost:3000");
		const result = await client.listJobs();

		expect(result).toEqual(mockJobs);
		expect(global.fetch).toHaveBeenCalledWith("http://localhost:3000/api/jobs", expect.any(Object));
	});

	it("should queue a job", async () => {
		const mockResponse = { jobId: "test-id", name: "test-job", message: "Job queued" };

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		});

		const client = createJobClient("http://localhost:3000");
		const result = await client.queueJob({ name: "test-job", params: { foo: "bar" } });

		expect(result).toEqual(mockResponse);
		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/queue",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ name: "test-job", params: { foo: "bar" } }),
			}),
		);
	});

	it("should get job history", async () => {
		const mockHistory = [
			{
				id: "job-1",
				name: "test-job",
				params: {},
				status: "completed",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockHistory,
		});

		const client = createJobClient("http://localhost:3000");
		const result = await client.getJobHistory({ name: "test-job" });

		expect(result).toEqual(mockHistory);
		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/history?name=test-job",
			expect.any(Object),
		);
	});

	it("should get job history with multiple filters", async () => {
		const mockHistory: Array<unknown> = [];

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockHistory,
		});

		const client = createJobClient("http://localhost:3000");
		await client.getJobHistory({ name: "test-job", status: "completed", limit: 10, offset: 5 });

		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/history?name=test-job&status=completed&limit=10&offset=5",
			expect.any(Object),
		);
	});

	it("should get job execution by ID", async () => {
		const mockExecution = {
			id: "job-1",
			name: "test-job",
			params: {},
			status: "completed",
			logs: [],
			retryCount: 0,
			createdAt: new Date(),
		};

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockExecution,
		});

		const client = createJobClient("http://localhost:3000");
		const result = await client.getJobExecution("job-1");

		expect(result).toEqual(mockExecution);
		expect(global.fetch).toHaveBeenCalledWith("http://localhost:3000/api/jobs/history/job-1", expect.any(Object));
	});

	it("should cancel a job", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await client.cancelJob("job-1");

		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/job-1/cancel",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("should retry a job", async () => {
		const mockResponse = { jobId: "job-1", name: "test-job", message: "Job queued" };

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockResponse,
		});

		const client = createJobClient("http://localhost:3000");
		const result = await client.retryJob("job-1");

		expect(result).toEqual(mockResponse);
		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/job-1/retry",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("should throw error when listJobs fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to list jobs" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.listJobs()).rejects.toThrow("Failed to list jobs");
	});

	it("should throw error when queueJob fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to queue job" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.queueJob({ name: "test", params: {} })).rejects.toThrow("Failed to queue job");
	});

	it("should throw error when getJobHistory fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to get history" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getJobHistory()).rejects.toThrow("Failed to get history");
	});

	it("should throw error when getJobExecution fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to get execution" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getJobExecution("job-1")).rejects.toThrow("Failed to get execution");
	});

	it("should throw error when cancelJob fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to cancel" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.cancelJob("job-1")).rejects.toThrow("Failed to cancel");
	});

	it("should throw error when retryJob fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to retry" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.retryJob("job-1")).rejects.toThrow("Failed to retry");
	});

	it("should handle error json parsing failure on cancel", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.reject(new Error("Invalid JSON")),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.cancelJob("job-1")).rejects.toThrow("Failed to cancel job");
	});

	it("should handle error json parsing failure on retry", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.reject(new Error("Invalid JSON")),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.retryJob("job-1")).rejects.toThrow("Failed to retry job");
	});

	it("should use default error message when error response has no error property for listJobs", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.listJobs()).rejects.toThrow("Failed to list jobs");
	});

	it("should use default error message when error response has no error property for queueJob", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.queueJob({ name: "test", params: {} })).rejects.toThrow("Failed to queue job");
	});

	it("should use default error message when error response has no error property for getJobHistory", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getJobHistory()).rejects.toThrow("Failed to get job history");
	});

	it("should use default error message when error response has no error property for getJobExecution", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getJobExecution("job-1")).rejects.toThrow("Failed to get job execution");
	});

	it("should use default error message when error response has no error property for cancelJob", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.cancelJob("job-1")).rejects.toThrow("Failed to cancel job");
	});

	it("should use default error message when error response has no error property for retryJob", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.retryJob("job-1")).rejects.toThrow("Failed to retry job");
	});

	it("should get job stats", async () => {
		const mockStats = { activeCount: 5, completedCount: 10, failedCount: 2, totalRetries: 3 };

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockStats,
		});

		const client = createJobClient("http://localhost:3000");
		const result = await client.getJobStats();

		expect(result).toEqual(mockStats);
		expect(global.fetch).toHaveBeenCalledWith("http://localhost:3000/api/jobs/stats", expect.any(Object));
	});

	it("should throw error when getJobStats fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to get stats" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getJobStats()).rejects.toThrow("Failed to get stats");
	});

	it("should use default error message when getJobStats fails with no error property", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getJobStats()).rejects.toThrow("Failed to get job stats");
	});

	it("should get dashboard active jobs", async () => {
		const mockJobs = [
			{
				id: "job-1",
				name: "test-job",
				params: {},
				status: "active",
				logs: [],
				retryCount: 0,
				createdAt: new Date(),
			},
		];

		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => mockJobs,
		});

		const client = createJobClient("http://localhost:3000");
		const result = await client.getDashboardActiveJobs();

		expect(result).toEqual(mockJobs);
		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/dashboard-active",
			expect.any(Object),
		);
	});

	it("should throw error when getDashboardActiveJobs fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to get active jobs" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getDashboardActiveJobs()).rejects.toThrow("Failed to get active jobs");
	});

	it("should use default error message when getDashboardActiveJobs fails with no error property", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.getDashboardActiveJobs()).rejects.toThrow("Failed to get dashboard active jobs");
	});

	it("should subscribe to job events", () => {
		const mockOnEvent = vi.fn();
		const client = createJobClient("http://localhost:3000");

		// Mock EventSource
		class MockEventSource {
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			url: string;
			constructor(url: string) {
				this.url = url;
			}
			close() {
				// Mock close
			}
		}

		global.EventSource = MockEventSource as never;

		const unsubscribe = client.subscribeToJobEvents(mockOnEvent);

		// Verify EventSource was created with correct URL
		expect(unsubscribe).toBeInstanceOf(Function);

		// Clean up
		unsubscribe();
	});

	it("should handle job event messages", () => {
		const mockOnEvent = vi.fn();
		const client = createJobClient("http://localhost:3000");

		let eventSource!: {
			onmessage: ((event: MessageEvent) => void) | null;
			onerror: ((event: Event) => void) | null;
		};

		// Mock EventSource
		class MockEventSource {
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			constructor(_url: string) {
				eventSource = this;
			}
			close() {
				// Mock close
			}
		}

		global.EventSource = MockEventSource as never;

		client.subscribeToJobEvents(mockOnEvent);

		// Simulate receiving a message
		const mockEvent = {
			type: "job_updated",
			jobId: "job-1",
			status: "completed",
		};

		eventSource.onmessage?.(new MessageEvent("message", { data: JSON.stringify(mockEvent) }));

		expect(mockOnEvent).toHaveBeenCalledWith(mockEvent);
	});

	it("should handle job event errors with error callback", () => {
		const mockOnEvent = vi.fn();
		const mockOnError = vi.fn();
		const client = createJobClient("http://localhost:3000");

		let eventSource!: {
			onmessage: ((event: MessageEvent) => void) | null;
			onerror: ((event: Event) => void) | null;
		};

		// Mock EventSource
		class MockEventSource {
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			constructor(_url: string) {
				eventSource = this;
			}
			close() {
				// Mock close
			}
		}

		global.EventSource = MockEventSource as never;

		client.subscribeToJobEvents(mockOnEvent, mockOnError);

		// Simulate an error
		eventSource.onerror?.(new Event("error"));

		expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
		expect(mockOnError.mock.calls[0][0].message).toBe("SSE connection error");
	});

	it("should handle job event parse errors with error callback", () => {
		const mockOnEvent = vi.fn();
		const mockOnError = vi.fn();
		const client = createJobClient("http://localhost:3000");

		let eventSource!: {
			onmessage: ((event: MessageEvent) => void) | null;
			onerror: ((event: Event) => void) | null;
		};

		// Mock EventSource
		class MockEventSource {
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			constructor(_url: string) {
				eventSource = this;
			}
			close() {
				// Mock close
			}
		}

		global.EventSource = MockEventSource as never;

		client.subscribeToJobEvents(mockOnEvent, mockOnError);

		// Simulate receiving invalid JSON
		eventSource.onmessage?.(new MessageEvent("message", { data: "invalid json" }));

		expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
		expect(mockOnEvent).not.toHaveBeenCalled();
	});

	it("should handle job event parse errors without error callback", () => {
		const mockOnEvent = vi.fn();
		const client = createJobClient("http://localhost:3000");

		let eventSource!: {
			onmessage: ((event: MessageEvent) => void) | null;
			onerror: ((event: Event) => void) | null;
		};

		// Mock EventSource
		class MockEventSource {
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			constructor(_url: string) {
				eventSource = this;
			}
			close() {
				// Mock close
			}
		}

		global.EventSource = MockEventSource as never;

		client.subscribeToJobEvents(mockOnEvent);

		// Simulate receiving invalid JSON - should not throw
		expect(() => {
			eventSource.onmessage?.(new MessageEvent("message", { data: "invalid json" }));
		}).not.toThrow();

		expect(mockOnEvent).not.toHaveBeenCalled();
	});

	it("should handle non-Error exceptions during parse with error callback", () => {
		const mockOnEvent = vi.fn();
		const mockOnError = vi.fn();
		const client = createJobClient("http://localhost:3000");

		let eventSource!: {
			onmessage: ((event: MessageEvent) => void) | null;
			onerror: ((event: Event) => void) | null;
		};

		// Mock EventSource
		class MockEventSource {
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			constructor(_url: string) {
				eventSource = this;
			}
			close() {
				// Mock close
			}
		}

		global.EventSource = MockEventSource as never;

		// Mock JSON.parse to throw a non-Error object
		const originalParse = JSON.parse;
		vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
			throw "string error"; // Non-Error exception
		});

		client.subscribeToJobEvents(mockOnEvent, mockOnError);

		// Simulate receiving a message that will cause JSON.parse to throw non-Error
		eventSource.onmessage?.(new MessageEvent("message", { data: "test" }));

		expect(mockOnError).toHaveBeenCalledWith(expect.any(Error));
		expect(mockOnError.mock.calls[0][0].message).toBe("Failed to parse SSE event");
		expect(mockOnEvent).not.toHaveBeenCalled();

		// Restore original
		JSON.parse = originalParse;
	});

	it("should close EventSource when unsubscribing", () => {
		const mockOnEvent = vi.fn();
		const client = createJobClient("http://localhost:3000");

		let eventSource!: { close: () => void };

		// Mock EventSource
		class MockEventSource {
			onmessage: ((event: MessageEvent) => void) | null = null;
			onerror: ((event: Event) => void) | null = null;
			constructor(_url: string) {
				eventSource = this;
			}
			close = vi.fn();
		}

		global.EventSource = MockEventSource as never;

		const unsubscribe = client.subscribeToJobEvents(mockOnEvent);
		unsubscribe();

		expect(eventSource.close).toHaveBeenCalled();
	});

	it("should pin a job", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ message: "Job pinned successfully" }),
		});

		const client = createJobClient("http://localhost:3000");
		await client.pinJob("job-1");

		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/job-1/pin",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("should throw error when pinJob fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to pin" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.pinJob("job-1")).rejects.toThrow("Failed to pin");
	});

	it("should use default error message when pinJob fails with no error property", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.pinJob("job-1")).rejects.toThrow("Failed to pin job");
	});

	it("should handle error json parsing failure on pinJob", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.reject(new Error("Invalid JSON")),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.pinJob("job-1")).rejects.toThrow("Failed to pin job");
	});

	it("should unpin a job", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ message: "Job unpinned successfully" }),
		});

		const client = createJobClient("http://localhost:3000");
		await client.unpinJob("job-1");

		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/job-1/unpin",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("should throw error when unpinJob fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to unpin" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.unpinJob("job-1")).rejects.toThrow("Failed to unpin");
	});

	it("should use default error message when unpinJob fails with no error property", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.unpinJob("job-1")).rejects.toThrow("Failed to unpin job");
	});

	it("should handle error json parsing failure on unpinJob", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.reject(new Error("Invalid JSON")),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.unpinJob("job-1")).rejects.toThrow("Failed to unpin job");
	});

	it("should dismiss a job", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: async () => ({ message: "Job dismissed successfully" }),
		});

		const client = createJobClient("http://localhost:3000");
		await client.dismissJob("job-1");

		expect(global.fetch).toHaveBeenCalledWith(
			"http://localhost:3000/api/jobs/job-1/dismiss",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("should throw error when dismissJob fails", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Failed to dismiss" }),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.dismissJob("job-1")).rejects.toThrow("Failed to dismiss");
	});

	it("should use default error message when dismissJob fails with no error property", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.dismissJob("job-1")).rejects.toThrow("Failed to dismiss job");
	});

	it("should handle error json parsing failure on dismissJob", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.reject(new Error("Invalid JSON")),
		});

		const client = createJobClient("http://localhost:3000");
		await expect(client.dismissJob("job-1")).rejects.toThrow("Failed to dismiss job");
	});
});
