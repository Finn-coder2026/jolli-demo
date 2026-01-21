import { CheckCircle2, Circle, Loader2, TrendingUp } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface JobStatsDisplayProps {
	/**
	 * The stats object from the job execution
	 */
	stats: unknown;
}

/**
 * Get localized label for a stat key
 * Falls back to auto-formatted label if no localized version exists
 */
// biome-ignore lint/suspicious/noExplicitAny: Intlayer returns Proxy objects with unknown structure
function getLocalizedLabel(key: string, content: any): string {
	// Check if we have a localized label for this specific key
	if (content.statLabels?.[key]) {
		return content.statLabels[key];
	}

	// Fall back to auto-formatting for unknown keys
	return formatLabel(key);
}

/**
 * Get localized phase/status value
 * Falls back to original value if no translation exists
 */
// biome-ignore lint/suspicious/noExplicitAny: Intlayer returns Proxy objects with unknown structure
function getLocalizedPhase(value: string, content: any): string {
	// Check if we have a localized phase value
	if (content.phases?.[value]) {
		return content.phases[value];
	}

	// Fall back to original value
	return value;
}

/**
 * Auto-detecting stats display component
 * Renders progress bars, count metrics, and status badges based on stats structure
 */
export function JobStatsDisplay({ stats }: JobStatsDisplayProps): ReactElement | null {
	const content = useIntlayer("misc");

	if (!stats || typeof stats !== "object") {
		return null;
	}

	const statsObj = stats as Record<string, unknown>;

	// Detect progress percentage (keys like: progress, percentage, percent, complete)
	const progressKeys = ["progress", "percentage", "percent", "complete"];
	const progressKey = Object.keys(statsObj).find(key => progressKeys.some(pk => key.toLowerCase().includes(pk)));
	const progressValue =
		progressKey && typeof statsObj[progressKey] === "number" ? (statsObj[progressKey] as number) : null;

	// Detect counts (keys like: processed, completed, total, count)
	const countKeys = ["processed", "completed", "total", "count", "items"];
	const counts = Object.entries(statsObj)
		.filter(([key, value]) => countKeys.some(ck => key.toLowerCase().includes(ck)) && typeof value === "number")
		.map(([key, value]) => ({ key, label: getLocalizedLabel(key, content), value: value as number }))
		.sort((a, b) => a.key.localeCompare(b.key)); // Sort alphabetically by key to ensure consistent order

	// Detect status (keys like: status, state, phase)
	const statusKeys = ["status", "state", "phase"];
	const statusKey = Object.keys(statsObj).find(key => statusKeys.some(sk => key.toLowerCase().includes(sk)));
	const statusValue = statusKey && typeof statsObj[statusKey] === "string" ? (statsObj[statusKey] as string) : null;

	// If no recognizable stats found, return null
	if (progressValue === null && counts.length === 0 && statusValue === null) {
		return null;
	}

	return (
		<div className="mt-3 space-y-2">
			{/* Progress Bar */}
			{progressValue !== null && (
				<div className="space-y-1">
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>{content.progress}</span>
						<span>{Math.round(progressValue)}%</span>
					</div>
					<div className="w-full bg-secondary rounded-full h-2">
						<div
							className="bg-blue-500 h-2 rounded-full transition-all duration-300"
							style={{ width: `${Math.min(100, Math.max(0, progressValue))}%` }}
						/>
					</div>
				</div>
			)}

			{/* Count Metrics */}
			{counts.length > 0 && (
				<div className="flex flex-wrap gap-3">
					{counts.map(({ key, label, value }) => (
						<div key={key} className="flex items-center gap-1.5 text-sm">
							<TrendingUp className="w-3.5 h-3.5 text-blue-500" />
							<span className="text-muted-foreground">{label}:</span>
							<span className="font-medium">{formatNumber(value)}</span>
						</div>
					))}
				</div>
			)}

			{/* Status Badge */}
			{statusValue !== null && (
				<div className="flex items-center gap-2">
					{getStatusIcon(statusValue)}
					<span className="text-xs font-medium px-2 py-1 rounded-full bg-secondary">
						{getLocalizedPhase(statusValue, content)}
					</span>
				</div>
			)}
		</div>
	);
}

/**
 * Format label by converting camelCase/snake_case to Title Case
 */
function formatLabel(key: string): string {
	return (
		key
			// Handle snake_case
			.replace(/_/g, " ")
			// Handle camelCase
			.replace(/([A-Z])/g, " $1")
			// Capitalize first letter of each word
			.replace(/\b\w/g, char => char.toUpperCase())
			.trim()
	);
}

/**
 * Format number with thousand separators
 */
function formatNumber(value: number): string {
	return value.toLocaleString();
}

/**
 * Get appropriate icon for status
 */
function getStatusIcon(status: string): ReactElement {
	const statusLower = status.toLowerCase();

	if (statusLower.includes("complete") || statusLower.includes("done") || statusLower.includes("success")) {
		return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
	}

	if (
		statusLower.includes("processing") ||
		statusLower.includes("running") ||
		statusLower.includes("in progress") ||
		statusLower.includes("active")
	) {
		return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
	}

	return <Circle className="w-3.5 h-3.5 text-gray-500" />;
}
