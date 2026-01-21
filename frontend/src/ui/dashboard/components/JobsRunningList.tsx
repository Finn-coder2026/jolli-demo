import { useClient } from "../../../contexts/ClientContext";
import { useMercureSubscription } from "../../../hooks/useMercureSubscription";
import { JobRunningCard } from "./JobRunningCard";
import type { JobEvent, JobExecution } from "jolli-common";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";

/**
 * List of currently running jobs that should be shown on the dashboard
 * Only renders when there are jobs with showInDashboard: true
 */
export function JobsRunningList(): ReactElement | null {
	const client = useClient();
	const [jobs, setJobs] = useState<Array<JobExecution>>([]);
	const [loading, setLoading] = useState(true);

	// Load initial jobs
	useEffect(() => {
		const loadJobs = async () => {
			try {
				const data = await client.jobs().getDashboardActiveJobs();
				setJobs(data);
			} catch (err) {
				console.error("Failed to load active jobs:", err);
			} finally {
				setLoading(false);
			}
		};

		loadJobs().then();
	}, [client]);

	// Handler for job events from SSE/Mercure
	const handleJobEvent = useCallback(
		(event: JobEvent) => {
			if (event.type === "job:started" && event.showInDashboard && event.jobId) {
				// Fetch the full job details and add to list
				client
					.jobs()
					.getJobExecution(event.jobId)
					.then(job => {
						setJobs(prev => {
							// Check if job already exists
							if (prev.some(j => j.id === job.id)) {
								return prev;
							}
							return [...prev, job];
						});
					})
					.catch(err => {
						console.error("Failed to load job details:", err);
					});
			} else if (event.type === "job:stats-updated" && event.jobId && event.stats !== undefined) {
				// Update job stats
				setJobs(prev =>
					prev.map(j => {
						if (j.id === event.jobId) {
							return { ...j, stats: event.stats };
						}
						return j;
					}),
				);
			} else if (
				(event.type === "job:completed" || event.type === "job:failed" || event.type === "job:cancelled") &&
				event.jobId
			) {
				// Handle job completion - either update status or remove based on keepCardAfterCompletion
				if (event.keepCardAfterCompletion) {
					// Update job status in the list and keep it visible
					setJobs(prev =>
						prev.map(j => {
							if (j.id === event.jobId) {
								const updatedJob: JobExecution = {
									...j,
									status:
										event.type === "job:completed"
											? "completed"
											: event.type === "job:failed"
												? "failed"
												: "cancelled",
									completedAt: new Date(),
								};
								// Only set completionInfo if it exists in the event
								if (event.completionInfo) {
									updatedJob.completionInfo = event.completionInfo;
								}
								return updatedJob;
							}
							return j;
						}),
					);
				} else {
					// Remove job from list as it shouldn't be kept after completion
					setJobs(prev => prev.filter(j => j.id !== event.jobId));
				}
			}
		},
		[client],
	);

	// Subscribe to job events via Mercure (with SSE fallback)
	useMercureSubscription<JobEvent>({
		type: "jobs",
		directSseUrl: "/api/jobs/events",
		onMessage: handleJobEvent,
		onError: err => {
			console.error("SSE error:", err);
		},
		enabled: true,
	});

	// Handler to dismiss a completed job
	const handleDismiss = async (jobId: string) => {
		try {
			await client.jobs().dismissJob(jobId);
			// Remove from local state immediately for better UX
			setJobs(prev => prev.filter(j => j.id !== jobId));
		} catch (err) {
			console.error("Failed to dismiss job:", err);
		}
	};

	// Handler to toggle pin status
	const handlePinToggle = async (jobId: string) => {
		const job = jobs.find(j => j.id === jobId);
		/* v8 ignore next 3 - Defensive code: job should always exist when button is clicked */
		if (!job) {
			return;
		}

		try {
			if (job.isPinned) {
				await client.jobs().unpinJob(jobId);
			} else {
				await client.jobs().pinJob(jobId);
			}

			// Update local state optimistically for better UX
			setJobs(prev =>
				prev.map(j => {
					if (j.id === jobId) {
						if (j.isPinned) {
							// Unpinning: create a new object without pinnedAt
							const { pinnedAt: _, ...rest } = j;
							return {
								...rest,
								isPinned: false,
							};
						}
						// Pinning: add pinnedAt
						return {
							...j,
							isPinned: true,
							pinnedAt: new Date(),
						};
					}
					return j;
				}),
			);
		} catch (err) {
			console.error("Failed to toggle pin:", err);
		}
	};

	// Don't render anything while loading or if there are no jobs
	if (loading || jobs.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3" data-testid="jobs-running-list">
			{jobs.map(job => (
				<JobRunningCard
					key={job.id}
					job={job}
					onDismiss={handleDismiss}
					isPinned={!!job.isPinned}
					onPinToggle={handlePinToggle}
				/>
			))}
		</div>
	);
}
