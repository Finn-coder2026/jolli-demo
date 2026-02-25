import { cn } from "../../common/ClassNameUtils";
import type { BuildLogEntry, BuildStreamState } from "../../hooks/useBuildStream";
import { usePreference } from "../../hooks/usePreference";
import { PREFERENCES } from "../../services/preferences/PreferencesRegistry";
import type { SiteWithUpdate } from "jolli-common";
import {
	AlertCircle,
	AlertTriangle,
	CheckCircle,
	ChevronDown,
	ChevronUp,
	Loader2,
	Radio,
	Terminal,
} from "lucide-react";
import { memo, type ReactElement, useEffect, useRef } from "react";
import { useIntlayer } from "react-intlayer";

export interface SiteBuildLogsPanelProps {
	site: SiteWithUpdate;
	buildStream: BuildStreamState;
}

type SiteLogsTabContent = ReturnType<typeof useIntlayer<"site-logs-tab">>;

interface BuildLogEntryDisplayProps {
	entry: BuildLogEntry;
	content: SiteLogsTabContent;
}

function renderOutputLines(output: string | undefined, keyPrefix: string, className: string): ReactElement {
	return (
		<>
			{output?.split("\n").map((line, i) => (
				<div key={`${keyPrefix}-${i}-${line.slice(0, 20)}`} className={className}>
					{line}
				</div>
			))}
		</>
	);
}

const BuildLogEntryDisplay = memo(function BuildLogEntryDisplay({
	entry,
	content,
}: BuildLogEntryDisplayProps): ReactElement {
	const timestamp = entry.timestamp.toLocaleTimeString();
	const timestampClass = "text-muted-foreground/60";

	switch (entry.type) {
		case "build:mode":
			return (
				<div className="text-blue-600 dark:text-blue-400">
					<span className={timestampClass}>[{timestamp}]</span>{" "}
					{content.logStartingBuild({ mode: entry.mode ?? "" }).value}
				</div>
			);

		case "build:step":
			return (
				<div className="text-blue-600 dark:text-blue-400 font-medium">
					<span className={timestampClass}>[{timestamp}]</span> {entry.message}
				</div>
			);

		case "build:stdout":
			return renderOutputLines(entry.output, "stdout", "text-foreground/80 whitespace-pre-wrap break-all");

		case "build:stderr":
			return renderOutputLines(
				entry.output,
				"stderr",
				"text-amber-600 dark:text-amber-400 whitespace-pre-wrap break-all",
			);

		case "build:command":
			return (
				<div className="text-cyan-600 dark:text-cyan-400 font-medium">
					<span className={timestampClass}>[{timestamp}]</span> $ {entry.command}
				</div>
			);

		case "build:state":
			return (
				<div className="text-purple-600 dark:text-purple-400">
					<span className={timestampClass}>[{timestamp}]</span>{" "}
					{content.logDeploymentState({ state: entry.state ?? "" }).value}
				</div>
			);

		case "build:completed":
			return (
				<div className="text-green-600 dark:text-green-400 font-medium flex items-center gap-2">
					<CheckCircle className="h-4 w-4" />
					<span className={timestampClass}>[{timestamp}]</span> {content.logBuildCompleted}
				</div>
			);

		case "build:failed":
			return (
				<div className="text-red-600 dark:text-red-400 font-medium">
					<span className={timestampClass}>[{timestamp}]</span>{" "}
					<AlertCircle className="h-4 w-4 inline mr-1" />
					{content.logBuildFailed({ error: entry.error ?? "" }).value}
				</div>
			);

		default:
			return <div className="text-muted-foreground">{JSON.stringify(entry)}</div>;
	}
});

export function SiteBuildLogsPanel({ site, buildStream }: SiteBuildLogsPanelProps): ReactElement {
	const content = useIntlayer("site-logs-tab");

	const [expanded, setExpanded] = usePreference(PREFERENCES.siteBuildLogsPanelExpanded);
	const logContainerRef = useRef<HTMLDivElement>(null);

	const isBuilding = site.status === "building" || site.status === "pending";
	const hasBuildError = site.status === "error";
	const hasLogs = buildStream.logs.length > 0;
	const isConnected = buildStream.connected;

	// Auto-expand when building starts (expanded intentionally omitted from deps -
	// we only want to auto-expand on building state transitions, not re-run when user collapses)
	useEffect(() => {
		if (isBuilding && !expanded) {
			setExpanded(true);
		}
	}, [isBuilding]); // expanded intentionally omitted — auto-expand only on building state transitions

	// Auto-scroll to bottom when new logs arrive
	useEffect(() => {
		if (expanded && logContainerRef.current) {
			logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
		}
	}, [buildStream.logs.length, expanded]);

	function getStatusIcon(): ReactElement {
		if (isBuilding) {
			return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
		}
		if (hasBuildError) {
			return <AlertCircle className="h-4 w-4 text-red-500" />;
		}
		return <CheckCircle className="h-4 w-4 text-green-500" />;
	}

	function getStatusText(): string {
		if (isBuilding) {
			return content.buildInProgress.value;
		}
		if (hasBuildError) {
			return content.buildFailed.value;
		}
		return content.buildComplete.value;
	}

	return (
		<div
			className={cn("flex flex-col transition-all duration-200", expanded ? "h-64" : "h-12")}
			data-testid="build-logs-panel"
		>
			{/* Header bar - h-12 aligns with sidebar footer */}
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className={cn(
					"h-12 px-4 flex items-center justify-between transition-colors flex-shrink-0 border-t",
					"bg-muted/50 hover:bg-muted/70",
					isBuilding && "border-t-blue-500/50",
					hasBuildError && "border-t-red-500/50",
				)}
				data-testid="logs-panel-toggle"
			>
				<div className="flex items-center gap-3">
					<Terminal className="h-4 w-4 text-muted-foreground" />
					<div className="flex items-center gap-2">
						{getStatusIcon()}
						<span className="text-sm font-medium" data-testid="build-status-text">
							{getStatusText()}
						</span>
					</div>

					{/* Progress indicator when building */}
					{isBuilding && buildStream.currentStep > 0 && buildStream.totalSteps > 0 && (
						<span className="text-xs text-muted-foreground" data-testid="build-step-progress">
							({buildStream.currentStep}/{buildStream.totalSteps})
						</span>
					)}
				</div>

				<div className="flex items-center gap-3">
					{/* Live indicator */}
					{isConnected && (
						<div className="flex items-center gap-1.5 text-xs text-green-500" data-testid="live-indicator">
							<Radio className="h-3 w-3 animate-pulse" />
							{content.connected}
						</div>
					)}

					<div className="text-muted-foreground">
						{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
					</div>
				</div>
			</button>

			{/* Expandable content */}
			{expanded && (
				<div className="flex-1 flex flex-col overflow-hidden">
					{/* Progress Bar */}
					{isBuilding && buildStream.totalSteps > 0 && (
						<div className="px-4 py-2 border-t bg-muted/30 flex-shrink-0" data-testid="build-progress">
							<div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
								<div
									className="h-full bg-blue-500 transition-all duration-300 ease-out"
									style={{
										width: `${Math.round((buildStream.currentStep / buildStream.totalSteps) * 100)}%`,
									}}
								/>
							</div>
						</div>
					)}

					{/* Log Output */}
					{hasLogs && (
						<div
							ref={logContainerRef}
							className="flex-1 bg-muted/30 font-mono text-xs p-3 overflow-y-auto scrollbar-thin border-t"
							data-testid="log-output"
						>
							<div className="space-y-0.5">
								{buildStream.logs.map((entry, index) => (
									<div key={`${entry.timestamp.getTime()}-${index}`}>
										<BuildLogEntryDisplay entry={entry} content={content} />
									</div>
								))}
							</div>
						</div>
					)}

					{/* Empty state when no logs */}
					{!hasLogs && !isBuilding && (
						<div
							className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/20"
							data-testid="no-build-history"
						>
							<div className="text-center">
								<Terminal className="h-6 w-6 mx-auto mb-1 opacity-50" />
								<p className="text-xs">{content.noBuildHistory}</p>
							</div>
						</div>
					)}

					{/* Waiting state during pending */}
					{!hasLogs && isBuilding && (
						<div
							className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/20"
							data-testid="waiting-for-build"
						>
							<div className="text-center">
								<Loader2 className="h-6 w-6 mx-auto mb-1 animate-spin text-blue-500" />
								<p className="text-xs">{content.waitingForBuild}</p>
							</div>
						</div>
					)}

					{/* Build errors */}
					{hasBuildError && site.metadata?.lastBuildError && (
						<div
							className="px-4 py-2 bg-red-50 dark:bg-red-950/20 border-t border-red-200 dark:border-red-800 flex-shrink-0"
							data-testid="build-error-section"
						>
							<div className="flex items-center gap-2">
								<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
								<span
									className="text-xs text-red-600 dark:text-red-300 truncate"
									data-testid="build-error-message"
								>
									{site.metadata.lastBuildError}
								</span>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
