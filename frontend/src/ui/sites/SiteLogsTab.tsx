import { cn } from "../../common/ClassNameUtils";
import type { BuildLogEntry, BuildStreamState } from "../../hooks/useBuildStream";
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
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface SiteLogsTabProps {
	docsite: SiteWithUpdate;
	/** Build stream state from useBuildStream hook */
	buildStream?: BuildStreamState;
}

/**
 * Formats a log entry for display with color coding.
 */
function formatLogEntry(entry: BuildLogEntry): ReactElement {
	const timestamp = entry.timestamp.toLocaleTimeString();

	switch (entry.type) {
		case "build:mode":
			return (
				<div className="text-blue-400">
					<span className="text-gray-500">[{timestamp}]</span> Starting {entry.mode} build...
				</div>
			);

		case "build:step":
			return (
				<div className="text-blue-300 font-medium">
					<span className="text-gray-500">[{timestamp}]</span> {entry.message}
				</div>
			);

		case "build:stdout":
			return (
				<>
					{entry.output?.split("\n").map((line, i) => (
						<div
							key={`stdout-${i}-${line.slice(0, 20)}`}
							className="text-green-300 whitespace-pre-wrap break-all"
						>
							{line}
						</div>
					))}
				</>
			);

		case "build:stderr":
			return (
				<>
					{entry.output?.split("\n").map((line, i) => (
						<div
							key={`stderr-${i}-${line.slice(0, 20)}`}
							className="text-yellow-300 whitespace-pre-wrap break-all"
						>
							{line}
						</div>
					))}
				</>
			);

		case "build:command":
			return (
				<div className="text-cyan-400 font-medium">
					<span className="text-gray-500">[{timestamp}]</span> $ {entry.command}
				</div>
			);

		case "build:state":
			return (
				<div className="text-purple-400">
					<span className="text-gray-500">[{timestamp}]</span> Deployment state: {entry.state}
				</div>
			);

		case "build:completed":
			return (
				<div className="text-green-400 font-medium flex items-center gap-2">
					<CheckCircle className="h-4 w-4" />
					<span className="text-gray-500">[{timestamp}]</span> Build completed successfully!
				</div>
			);

		case "build:failed":
			return (
				<div className="text-red-400 font-medium">
					<span className="text-gray-500">[{timestamp}]</span> <AlertCircle className="h-4 w-4 inline mr-1" />
					Build failed: {entry.error}
				</div>
			);

		default:
			return <div className="text-gray-400">{JSON.stringify(entry)}</div>;
	}
}

/**
 * Site Logs Tab - Clean build log viewer with collapsible details.
 * Shows build progress, errors, and history in a polished interface.
 */
export function SiteLogsTab({ docsite, buildStream }: SiteLogsTabProps): ReactElement {
	const content = useIntlayer("site-logs-tab");
	const [expanded, setExpanded] = useState(false);
	const logContainerRef = useRef<HTMLDivElement>(null);

	// Determine build state
	const isBuilding = docsite.status === "building" || docsite.status === "pending";
	const hasBuildError = docsite.status === "error";
	const hasLogs = buildStream && buildStream.logs.length > 0;
	const isConnected = buildStream?.connected ?? false;

	// Auto-expand when building starts
	useEffect(() => {
		if (isBuilding) {
			setExpanded(true);
		}
	}, [isBuilding]);

	// Auto-scroll to bottom when new logs arrive
	useEffect(() => {
		if (expanded && logContainerRef.current) {
			logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
		}
	}, [buildStream?.logs.length, expanded]);

	return (
		<div className="space-y-6">
			{/* Build Status Summary Card */}
			<div
				className={cn(
					"border rounded-lg overflow-hidden",
					isBuilding && "border-blue-500/50",
					hasBuildError && "border-red-500/50",
					!isBuilding && !hasBuildError && "border-green-500/50",
				)}
			>
				{/* Header */}
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="w-full px-4 py-3 flex items-center justify-between bg-card hover:bg-muted/50 transition-colors"
					data-testid="logs-expand-toggle"
				>
					<div className="flex items-center gap-3">
						{/* Status Icon */}
						{isBuilding ? (
							<Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
						) : hasBuildError ? (
							<AlertCircle className="h-5 w-5 text-red-500" />
						) : (
							<CheckCircle className="h-5 w-5 text-green-500" />
						)}

						{/* Status Text */}
						<div className="text-left">
							<div className="font-medium">
								{isBuilding
									? content.buildInProgress
									: hasBuildError
										? content.buildFailed
										: content.buildComplete}
							</div>
							{buildStream && buildStream.currentStep > 0 && isBuilding && (
								<div className="text-sm text-muted-foreground mt-1">{buildStream.currentMessage}</div>
							)}
						</div>
					</div>

					<div className="flex items-center gap-3">
						{/* Live indicator */}
						{isConnected && (
							<div
								className="flex items-center gap-1.5 text-xs text-green-500"
								data-testid="live-indicator"
							>
								<Radio className="h-3 w-3 animate-pulse" />
								{content.connected}
							</div>
						)}

						{/* Expand/Collapse Icon */}
						{hasLogs && (
							<div className="text-muted-foreground">
								{expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
							</div>
						)}
					</div>
				</button>

				{/* Progress Bar */}
				{isBuilding && buildStream && buildStream.totalSteps > 0 && (
					<div className="px-4 py-2 border-t bg-muted/30" data-testid="build-progress">
						<div className="h-2 w-full bg-muted rounded-full overflow-hidden">
							<div
								className="h-full bg-blue-500 transition-all duration-300 ease-out"
								style={{
									width: `${Math.round((buildStream.currentStep / buildStream.totalSteps) * 100)}%`,
								}}
							/>
						</div>
						<div className="text-xs text-muted-foreground mt-1 text-right">
							{buildStream.currentStep} / {buildStream.totalSteps}
						</div>
					</div>
				)}

				{/* Expandable Log Output */}
				{expanded && hasLogs && (
					<div
						ref={logContainerRef}
						className="bg-gray-900 text-gray-100 font-mono text-sm p-4 overflow-y-auto max-h-96 border-t border-gray-700"
						data-testid="log-output"
					>
						<div className="space-y-1">
							{buildStream.logs.map((entry, index) => (
								<div key={`${entry.timestamp.getTime()}-${index}`}>{formatLogEntry(entry)}</div>
							))}
						</div>
					</div>
				)}

				{/* Empty state when no logs */}
				{expanded && !hasLogs && !isBuilding && (
					<div className="p-8 text-center text-muted-foreground border-t">
						<Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
						<p className="text-sm">{content.noBuildHistory}</p>
					</div>
				)}

				{/* Waiting state during pending */}
				{expanded && !hasLogs && isBuilding && (
					<div className="p-8 text-center text-muted-foreground border-t">
						<Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-blue-500" />
						<p className="text-sm">{content.waitingForBuild}</p>
					</div>
				)}
			</div>

			{/* Build Errors Section */}
			{hasBuildError && docsite.metadata?.validationErrors && (
				<div
					className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"
					data-testid="build-errors-section"
				>
					<div className="flex items-center gap-2 mb-3">
						<AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
						<span className="font-medium text-red-700 dark:text-red-400">{content.buildErrors}</span>
					</div>
					<pre
						className="text-sm text-red-600 dark:text-red-300 whitespace-pre-wrap font-mono bg-red-100/50 dark:bg-red-900/30 p-3 rounded overflow-x-auto"
						data-testid="validation-errors-content"
					>
						{docsite.metadata.validationErrors}
					</pre>
				</div>
			)}

			{/* Last Build Error (fallback) */}
			{hasBuildError && !docsite.metadata?.validationErrors && docsite.metadata?.lastBuildError && (
				<div
					className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg"
					data-testid="last-build-error-section"
				>
					<div className="flex items-center gap-2 mb-2">
						<AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
						<span className="font-medium text-red-700 dark:text-red-400">{content.lastBuildError}</span>
					</div>
					<p className="text-sm text-red-600 dark:text-red-300">{docsite.metadata.lastBuildError}</p>
				</div>
			)}
		</div>
	);
}
