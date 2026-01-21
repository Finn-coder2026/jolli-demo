import { useClient } from "../../contexts/ClientContext";
import type { Integration } from "jolli-common";
import { Play } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

interface DemoJob {
	name: string;
	displayName: string;
	description: string;
}

const demoJobs: Array<DemoJob> = [
	{
		name: "demo:quick-stats",
		displayName: "Quick Stats",
		description: "Simple counter demo (5-10 seconds)",
	},
	{
		name: "demo:multi-stat-progress",
		displayName: "Multi-Stat Progress",
		description: "Multiple stats updating (15-20 seconds)",
	},
	{
		name: "demo:articles-link",
		displayName: "Articles Link",
		description: "Demo with link to Articles page (10-15 seconds)",
	},
	{
		name: "demo:slow-processing",
		displayName: "Slow Processing",
		description: "Long-running job with phases (30-40 seconds)",
	},
	{
		name: "demo:run-end2end-flow",
		displayName: "Create Architecture Article",
		description: "Sample job that prints hello world",
	},
	{
		name: "demo:doc2docusaurus",
		displayName: "Doc2Docusaurus",
		description: "Sync documents from database to Docusaurus format",
	},
	{
		name: "demo:code-to-api-articles",
		displayName: "Code 2 API Articles",
		description: "Generate API docs from code (no deploy)",
	},
	{
		name: "demo:run-jolliscript",
		displayName: "Run JolliScript",
		description: "Execute JolliScript workflow on stored DocDao markdown content",
	},
	{
		name: "demo:migrate-jrns",
		displayName: "Migrate JRNs",
		description: "Migrate old path-based JRN format to new structured JRN format in article content",
	},
];

export function DemoJobsTester(): ReactElement {
	const client = useClient();
	const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
	const [error, setError] = useState<string | null>(null);

	// Integrations (active only) for end2end flow
	const [integrations, setIntegrations] = useState<Array<Integration>>([]);
	const [selectedIntegrationId, setSelectedIntegrationId] = useState<number | undefined>(undefined);

	// JRN prefix for doc2docusaurus job
	const [jrnPrefix, setJrnPrefix] = useState<string>("/home/space-1");

	// docJrn for run-jolliscript job
	const [docJrn, setDocJrn] = useState<string>("");

	// Load active integrations for dropdown
	useEffect(() => {
		(async () => {
			try {
				const data = await client.integrations().listIntegrations();
				const active = data.filter(i => i.status === "active");
				setIntegrations(active);
				if (active.length > 0) {
					setSelectedIntegrationId(active[0].id);
				}
			} catch (err) {
				console.error("Failed to load integrations", err);
			}
		})();
	}, [client]);

	async function handleRunDemo(jobName: string): Promise<void> {
		setError(null);
		setRunningJobs(prev => new Set(prev).add(jobName));

		try {
			if (jobName === "demo:run-end2end-flow") {
				// Always require integrationId for this job; include jrnPrefix when provided
				const params: { integrationId: number; jrnPrefix?: string } = {
					integrationId: selectedIntegrationId as number,
				};
				if (jrnPrefix) {
					params.jrnPrefix = jrnPrefix;
				}
				await client.devTools().triggerDemoJob(jobName, params);
			} else if (jobName === "demo:code-to-api-articles") {
				// Requires integrationId; include jrnPrefix optionally
				const params: { integrationId: number; jrnPrefix?: string } = {
					integrationId: selectedIntegrationId as number,
				};
				if (jrnPrefix) {
					params.jrnPrefix = jrnPrefix;
				}
				await client.devTools().triggerDemoJob(jobName, params);
			} else if (jobName === "demo:doc2docusaurus") {
				await client.devTools().triggerDemoJob(jobName, jrnPrefix ? { jrnPrefix } : {});
			} else if (jobName === "demo:run-jolliscript") {
				await client.devTools().triggerDemoJob(jobName, { docJrn: docJrn.trim() });
			} else {
				await client.devTools().triggerDemoJob(jobName);
			}
			// Keep the job marked as running for a short time to prevent rapid re-triggering
			setTimeout(() => {
				setRunningJobs(prev => {
					const next = new Set(prev);
					next.delete(jobName);
					return next;
				});
			}, 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to trigger demo job");
			setRunningJobs(prev => {
				const next = new Set(prev);
				next.delete(jobName);
				return next;
			});
		}
	}

	return (
		<div className="bg-card rounded-lg p-6 border">
			<div className="mb-4">
				<h2 className="font-semibold text-lg mb-1">Demo Jobs</h2>
				<p className="text-sm text-muted-foreground">
					Test dashboard widgets with demo jobs that update stats in real-time
				</p>
			</div>

			{error ? (
				<div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
					{error}
				</div>
			) : null}

			<div className="space-y-3">
				{demoJobs.map(job => (
					<div key={job.name} className="p-3 bg-muted/50 rounded-lg">
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0 mr-4">
								<div className="font-medium text-sm">{job.displayName}</div>
								<div className="text-xs text-muted-foreground mt-0.5">{job.description}</div>
							</div>
							<button
								type="button"
								onClick={() => handleRunDemo(job.name)}
								disabled={
									runningJobs.has(job.name) ||
									((job.name === "demo:run-end2end-flow" ||
										job.name === "demo:code-to-api-articles") &&
										(selectedIntegrationId === undefined || integrations.length === 0)) ||
									(job.name === "demo:run-jolliscript" && (!docJrn || docJrn.trim().length === 0))
								}
								className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								<Play className="w-4 h-4" />
								{runningJobs.has(job.name) ? "Running..." : "Run Demo"}
							</button>
						</div>

						{job.name === "demo:run-end2end-flow" || job.name === "demo:code-to-api-articles" ? (
							<div className="mt-3 flex items-center gap-2">
								<label htmlFor="integration-select" className="text-xs text-muted-foreground">
									Integration
								</label>
								<select
									id="integration-select"
									className="border rounded px-2 py-1 text-sm bg-background"
									value={selectedIntegrationId ?? ""}
									/* v8 ignore start - standard select onChange handler */
									onChange={e =>
										setSelectedIntegrationId(e.target.value ? Number(e.target.value) : undefined)
									}
									/* v8 ignore stop */
								>
									{integrations.length === 0 ? (
										<option value="">No active integrations found</option>
									) : (
										integrations.map(integration => (
											<option key={integration.id} value={integration.id}>
												{integration.name}
											</option>
										))
									)}
								</select>
							</div>
						) : null}

						{job.name === "demo:run-end2end-flow" || job.name === "demo:code-to-api-articles" ? (
							<div className="mt-3 flex items-center gap-2">
								<label htmlFor="jrn-prefix-input-end2end" className="text-xs text-muted-foreground">
									JRN Prefix (Run)
								</label>
								<input
									id="jrn-prefix-input-end2end"
									type="text"
									className="border rounded px-2 py-1 text-sm bg-background flex-1"
									value={jrnPrefix}
									onChange={e => setJrnPrefix(e.target.value)}
									placeholder="/home/space-1"
								/>
							</div>
						) : null}

						{job.name === "demo:doc2docusaurus" ? (
							<div className="mt-3 flex items-center gap-2">
								<label htmlFor="jrn-prefix-input" className="text-xs text-muted-foreground">
									JRN Prefix
								</label>
								<input
									id="jrn-prefix-input"
									type="text"
									className="border rounded px-2 py-1 text-sm bg-background flex-1"
									value={jrnPrefix}
									onChange={e => setJrnPrefix(e.target.value)}
									placeholder="/home/space-1"
								/>
							</div>
						) : null}

						{job.name === "demo:run-jolliscript" ? (
							<div className="mt-3 flex items-center gap-2">
								<label htmlFor="doc-jrn-input" className="text-xs text-muted-foreground">
									Document JRN
								</label>
								<input
									id="doc-jrn-input"
									type="text"
									className="border rounded px-2 py-1 text-sm bg-background flex-1"
									value={docJrn}
									onChange={e => setDocJrn(e.target.value)}
									placeholder="/home/space-1/example.md"
								/>
							</div>
						) : null}
					</div>
				))}
			</div>

			<div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-200">
				<strong>Tip:</strong> Navigate to the Dashboard page to see the demo jobs running with live stat
				updates.
			</div>
		</div>
	);
}
