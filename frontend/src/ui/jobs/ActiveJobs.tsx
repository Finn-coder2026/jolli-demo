import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/LoadingState";
import { useClient } from "../../contexts/ClientContext";
import { useNavigate } from "../../contexts/RouterContext";
import { useMercureSubscription } from "../../hooks/useMercureSubscription";
import { JobDetailRow } from "./components/JobDetailRow";
import type { JobClient, JobEvent, JobExecution } from "jolli-common";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Handle job cancellation with error handling
 * Exported for testing
 */
export async function cancelJobWithErrorHandling(
	jobsApi: JobClient,
	jobId: string,
	setError: (error: string) => void,
	errorMessage: string,
): Promise<void> {
	try {
		await jobsApi.cancelJob(jobId);
		// Job will be removed from list via SSE event
	} catch (err) {
		console.error("Failed to cancel job:", err);
		const message = err instanceof Error ? err.message : errorMessage;
		setError(message);
	}
}

/**
 * Load active jobs with error handling
 * Exported for testing
 */
export async function loadActiveJobs(
	jobsApi: JobClient,
	setLoading: (loading: boolean) => void,
	setError: (error: string | null) => void,
	setJobs: (jobs: Array<JobExecution>) => void,
	errorMessage: string,
): Promise<void> {
	try {
		setLoading(true);
		setError(null);
		const data = await jobsApi.getJobHistory({ status: "active", limit: 100 });
		setJobs(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : errorMessage;
		setError(message);
	} finally {
		setLoading(false);
	}
}

/**
 * Active jobs view with real-time updates
 */
export function ActiveJobs(): ReactElement {
	const content = useIntlayer("active-jobs");
	const client = useClient();
	const navigate = useNavigate();
	const [jobs, setJobs] = useState<Array<JobExecution>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadJobs = () => loadActiveJobs(client.jobs(), setLoading, setError, setJobs, content.errors.loadJobs.value);

	useEffect(() => {
		loadJobs();
	}, []);

	// Handler for job events from SSE/Mercure
	const handleJobEvent = useCallback(
		(event: JobEvent) => {
			if (event.type === "job:started" && event.jobId) {
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
							return [job, ...prev];
						});
					})
					.catch(err => {
						console.error("Failed to load job details:", err);
					});
			} else if (
				(event.type === "job:completed" || event.type === "job:failed" || event.type === "job:cancelled") &&
				event.jobId
			) {
				// Remove job from list
				setJobs(prev => prev.filter(j => j.id !== event.jobId));
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

	// Handler for cancelling jobs
	const handleCancelJob = (jobId: string) => {
		return cancelJobWithErrorHandling(client.jobs(), jobId, setError, content.errors.cancelJob.value);
	};

	if (loading) {
		return <LoadingState message={content.loading.value} />;
	}

	return (
		<div className="bg-card rounded-lg p-6 border h-full overflow-auto">
			<div className="mb-6">
				<div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
					<button
						type="button"
						onClick={() => navigate("/dashboard")}
						className="hover:text-foreground transition-colors"
					>
						{content.dashboard}
					</button>
					<ChevronRight className="w-4 h-4" />
					<span className="text-foreground">{content.title}</span>
				</div>
				<div className="flex items-center gap-3 mb-2">
					<Loader2 className="w-8 h-8 animate-spin text-blue-500" />
					<h1 className="text-2xl font-semibold m-0">{content.title}</h1>
				</div>
				<p className="text-sm text-muted-foreground m-0">{content.subtitle}</p>
			</div>

			{error && (
				<div className="mb-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400">
					{error}
				</div>
			)}

			<div className="mb-6">
				<Button onClick={loadJobs}>{content.refresh}</Button>
			</div>

			{jobs.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground">{content.noActiveJobs}</div>
			) : (
				<div className="space-y-3">
					{jobs.map(job => (
						<JobDetailRow key={job.id} job={job} onCancel={handleCancelJob} />
					))}
				</div>
			)}
		</div>
	);
}
