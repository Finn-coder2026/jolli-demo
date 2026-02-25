import { Button } from "../../components/ui/Button";
import { LoadingState } from "../../components/ui/LoadingState";
import { SelectBox } from "../../components/ui/SelectBox";
import { useClient } from "../../contexts/ClientContext";
import { useNavigate } from "../../contexts/RouterContext";
import { JobDetailRow } from "./components/JobDetailRow";
import type { JobClient, JobExecution, JobStatus } from "jolli-common";
import { ChevronRight, History } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Handle job retry with error handling
 * Exported for testing
 */
export async function retryJobWithErrorHandling(
	jobsApi: JobClient,
	jobId: string,
	onSuccess: () => void,
): Promise<void> {
	try {
		await jobsApi.retryJob(jobId);
		onSuccess(); // Reload to show new job
	} catch (err) {
		console.error("Failed to retry job:", err);
	}
}

/**
 * Load job history with filters
 * Exported for testing
 */
export async function loadJobHistory(
	jobsApi: JobClient,
	statusFilter: JobStatus | "all",
	setLoading: (loading: boolean) => void,
	setError: (error: string | null) => void,
	setJobs: (jobs: Array<JobExecution>) => void,
	errorMessage: string,
): Promise<void> {
	try {
		setLoading(true);
		setError(null);
		const filters = statusFilter !== "all" ? { status: statusFilter, limit: 100 } : { limit: 100 };
		const data = await jobsApi.getJobHistory(filters);
		setJobs(data);
	} catch (err) {
		const message = err instanceof Error ? err.message : errorMessage;
		setError(message);
	} finally {
		setLoading(false);
	}
}

export interface JobHistoryProps {
	/**
	 * Initial status filter (for testing)
	 */
	initialStatusFilter?: JobStatus | "all";
}

/**
 * Job history view with filters
 */
export function JobHistory({ initialStatusFilter = "all" }: JobHistoryProps = {}): ReactElement {
	const content = useIntlayer("job-history");
	const client = useClient();
	const navigate = useNavigate();
	const [jobs, setJobs] = useState<Array<JobExecution>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState<JobStatus | "all">(initialStatusFilter);

	const loadJobs = () =>
		loadJobHistory(client.jobs(), statusFilter, setLoading, setError, setJobs, content.error.value);

	useEffect(() => {
		loadJobs();
	}, [statusFilter]);

	// Handler for retrying jobs
	function handleRetryJob(jobId: string) {
		return retryJobWithErrorHandling(client.jobs(), jobId, loadJobs);
	}

	if (loading) {
		return <LoadingState message={content.loading.value} />;
	}

	return (
		<div className="bg-card rounded-lg p-6 border h-full overflow-auto scrollbar-thin">
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
					<History className="w-8 h-8" />
					<h1 className="text-2xl font-semibold m-0">{content.title}</h1>
				</div>
				<p className="text-sm text-muted-foreground m-0">{content.subtitle}</p>
			</div>

			{error && (
				<div className="mb-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400">
					{error}
				</div>
			)}

			<div className="mb-6 flex gap-4 items-center">
				<div className="flex-1">
					<SelectBox
						value={statusFilter}
						onValueChange={(value: string) => setStatusFilter(value as JobStatus | "all")}
						options={[
							{ value: "all", label: content.statusFilters.all.value },
							{ value: "completed", label: content.statusFilters.completed.value },
							{ value: "failed", label: content.statusFilters.failed.value },
							{ value: "cancelled", label: content.statusFilters.cancelled.value },
							{ value: "active", label: content.statusFilters.active.value },
							{ value: "queued", label: content.statusFilters.queued.value },
						]}
					/>
				</div>
				<Button onClick={loadJobs}>{content.refresh}</Button>
			</div>

			{jobs.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground">{content.noJobs}</div>
			) : (
				<div className="space-y-3">
					{jobs.map(job => (
						<JobDetailRow key={job.id} job={job} onRetry={handleRetryJob} />
					))}
				</div>
			)}
		</div>
	);
}
