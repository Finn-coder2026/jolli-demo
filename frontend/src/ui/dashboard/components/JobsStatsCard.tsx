import { useClient } from "../../../contexts/ClientContext";
import { useNavigate } from "../../../contexts/RouterContext";
import { DashboardCard } from "./DashboardCard";
import type { JobStats } from "jolli-common";
import { AlertCircle, CheckCircle, Clock, RefreshCw } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Job statistics card for the dashboard
 */
export function JobsStatsCard(): ReactElement {
	const content = useIntlayer("dashboard");
	const client = useClient();
	const navigate = useNavigate();
	const [stats, setStats] = useState<JobStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadStats = async () => {
		try {
			setError(null);
			const data = await client.jobs().getJobStats();
			setStats(data);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to load job stats";
			setError(message);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadStats();

		// Poll every 10 seconds
		const interval = setInterval(() => {
			loadStats();
		}, 10000);

		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (loading) {
		return (
			<DashboardCard title={content.jobsTitle.value} icon={Clock}>
				<div className="text-sm text-muted-foreground">{content.loadingStats}</div>
			</DashboardCard>
		);
	}

	if (error) {
		return (
			<DashboardCard title={content.jobsTitle.value} icon={Clock}>
				<div className="text-sm text-red-500">{error}</div>
			</DashboardCard>
		);
	}

	if (!stats) {
		return (
			<DashboardCard title={content.jobsTitle.value} icon={Clock}>
				<div className="text-sm text-muted-foreground">{content.noStats}</div>
			</DashboardCard>
		);
	}

	return (
		<DashboardCard title={content.jobsTitle.value} icon={Clock}>
			<div className="grid grid-cols-2 gap-4">
				<StatItem
					icon={Clock}
					label={content.statRunning.value}
					value={stats.activeCount}
					color="text-blue-500"
				/>
				<StatItem
					icon={CheckCircle}
					label={content.statCompleted.value}
					value={stats.completedCount}
					color="text-green-500"
				/>
				<StatItem
					icon={AlertCircle}
					label={content.statFailed.value}
					value={stats.failedCount}
					color="text-red-500"
				/>
				<StatItem
					icon={RefreshCw}
					label={content.statRetries.value}
					value={stats.totalRetries}
					color="text-orange-500"
				/>
			</div>

			<div className="mt-6 pt-4 border-t flex gap-3">
				<button
					type="button"
					onClick={() => navigate("/jobs/active")}
					className="text-sm text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
				>
					{content.viewRunningJobs}
				</button>
				<span className="text-muted-foreground">•</span>
				<button
					type="button"
					onClick={() => navigate("/jobs/history")}
					className="text-sm text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
				>
					{content.viewHistory}
				</button>
			</div>
		</DashboardCard>
	);
}

interface StatItemProps {
	icon: typeof Clock;
	label: string;
	value: number;
	color: string;
}

function StatItem({ icon: Icon, label, value, color }: StatItemProps): ReactElement {
	return (
		<div className="flex items-start gap-3">
			<Icon className={`w-5 h-5 ${color} mt-1`} />
			<div>
				<div className="text-2xl font-semibold">{value}</div>
				<div className="text-sm text-muted-foreground">{label}</div>
			</div>
		</div>
	);
}
