import type {
	JobEvent,
	JobExecution,
	JobHistoryFilters,
	JobListing,
	JobStats,
	QueueJobRequest,
	QueueJobResponse,
} from "../types/Job";

/**
 * Client for job-related API operations
 */
export interface JobClient {
	/**
	 * List all available job types
	 */
	listJobs(): Promise<Array<JobListing>>;

	/**
	 * Queue a job for execution
	 */
	queueJob(request: QueueJobRequest): Promise<QueueJobResponse>;

	/**
	 * Get job execution history
	 */
	getJobHistory(filters?: JobHistoryFilters): Promise<Array<JobExecution>>;

	/**
	 * Get job execution by ID
	 */
	getJobExecution(jobId: string): Promise<JobExecution>;

	/**
	 * Cancel a running job
	 */
	cancelJob(jobId: string): Promise<void>;

	/**
	 * Retry a failed job
	 */
	retryJob(jobId: string): Promise<QueueJobResponse>;

	/**
	 * Get job statistics
	 */
	getJobStats(): Promise<JobStats>;

	/**
	 * Get active jobs that should be shown in the dashboard
	 */
	getDashboardActiveJobs(): Promise<Array<JobExecution>>;

	/**
	 * Pin a job to keep it visible on dashboard indefinitely
	 */
	pinJob(jobId: string): Promise<void>;

	/**
	 * Unpin a job to allow it to auto-dismiss after timeout
	 */
	unpinJob(jobId: string): Promise<void>;

	/**
	 * Dismiss a job to hide it from dashboard for all users
	 */
	dismissJob(jobId: string): Promise<void>;

	/**
	 * Subscribe to job events via Server-Sent Events
	 * Returns a cleanup function to unsubscribe
	 */
	subscribeToJobEvents(onEvent: (event: JobEvent) => void, onError?: (error: Error) => void): () => void;
}

/**
 * Create a job client
 */
export function createJobClient(baseUrl: string): JobClient {
	return {
		listJobs: async (): Promise<Array<JobListing>> => {
			const response = await fetch(`${baseUrl}/api/jobs`, {
				method: "GET",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to list jobs" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to list jobs");
			}

			return (await response.json()) as Array<JobListing>;
		},

		queueJob: async (request: QueueJobRequest): Promise<QueueJobResponse> => {
			const response = await fetch(`${baseUrl}/api/jobs/queue`, {
				method: "POST",
				credentials: "include",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(request),
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to queue job" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to queue job");
			}

			return (await response.json()) as QueueJobResponse;
		},

		getJobHistory: async (filters?: JobHistoryFilters): Promise<Array<JobExecution>> => {
			const queryParams = new URLSearchParams();

			if (filters?.name) {
				queryParams.append("name", filters.name);
			}
			if (filters?.status) {
				queryParams.append("status", filters.status);
			}
			if (filters?.limit !== undefined) {
				queryParams.append("limit", filters.limit.toString());
			}
			if (filters?.offset !== undefined) {
				queryParams.append("offset", filters.offset.toString());
			}

			const url = `${baseUrl}/api/jobs/history${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

			const response = await fetch(url, {
				method: "GET",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to get job history" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to get job history");
			}

			return (await response.json()) as Array<JobExecution>;
		},

		getJobExecution: async (jobId: string): Promise<JobExecution> => {
			const response = await fetch(`${baseUrl}/api/jobs/history/${jobId}`, {
				method: "GET",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to get job execution" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to get job execution");
			}

			return (await response.json()) as JobExecution;
		},

		cancelJob: async (jobId: string): Promise<void> => {
			const response = await fetch(`${baseUrl}/api/jobs/${jobId}/cancel`, {
				method: "POST",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to cancel job" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to cancel job");
			}
		},

		retryJob: async (jobId: string): Promise<QueueJobResponse> => {
			const response = await fetch(`${baseUrl}/api/jobs/${jobId}/retry`, {
				method: "POST",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to retry job" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to retry job");
			}

			return (await response.json()) as QueueJobResponse;
		},

		getJobStats: async (): Promise<JobStats> => {
			const response = await fetch(`${baseUrl}/api/jobs/stats`, {
				method: "GET",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to get job stats" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to get job stats");
			}

			return (await response.json()) as JobStats;
		},

		getDashboardActiveJobs: async (): Promise<Array<JobExecution>> => {
			const response = await fetch(`${baseUrl}/api/jobs/dashboard-active`, {
				method: "GET",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response
					.json()
					.catch(() => ({ error: "Failed to get dashboard active jobs" }))) as { error: string };
				throw new Error(error.error || "Failed to get dashboard active jobs");
			}

			return (await response.json()) as Array<JobExecution>;
		},

		pinJob: async (jobId: string): Promise<void> => {
			const response = await fetch(`${baseUrl}/api/jobs/${jobId}/pin`, {
				method: "POST",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to pin job" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to pin job");
			}
		},

		unpinJob: async (jobId: string): Promise<void> => {
			const response = await fetch(`${baseUrl}/api/jobs/${jobId}/unpin`, {
				method: "POST",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to unpin job" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to unpin job");
			}
		},

		dismissJob: async (jobId: string): Promise<void> => {
			const response = await fetch(`${baseUrl}/api/jobs/${jobId}/dismiss`, {
				method: "POST",
				credentials: "include",
			});

			if (!response.ok) {
				const error = (await response.json().catch(() => ({ error: "Failed to dismiss job" }))) as {
					error: string;
				};
				throw new Error(error.error || "Failed to dismiss job");
			}
		},

		subscribeToJobEvents: (onEvent: (event: JobEvent) => void, onError?: (error: Error) => void): (() => void) => {
			const eventSource = new EventSource(`${baseUrl}/api/jobs/events`, {
				withCredentials: true,
			});

			eventSource.onmessage = event => {
				try {
					const data = JSON.parse(event.data) as JobEvent;
					onEvent(data);
				} catch (error) {
					const err = error instanceof Error ? error : new Error("Failed to parse SSE event");
					onError?.(err);
				}
			};

			eventSource.onerror = _error => {
				const err = new Error("SSE connection error");
				onError?.(err);
				// EventSource will automatically reconnect unless we close it
			};

			// Return cleanup function
			return () => {
				eventSource.close();
			};
		},
	};
}
