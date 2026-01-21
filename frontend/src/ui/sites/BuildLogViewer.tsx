/**
 * Component for displaying build progress logs in real-time.
 * Shows step progress, stdout/stderr output, and completion status.
 */

import { cn } from "../../common/ClassNameUtils";
import type { BuildLogEntry, BuildStreamState } from "../../hooks/useBuildStream";
import { AlertCircle, CheckCircle, Loader2, Terminal } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";

interface BuildLogViewerProps {
	/** Build stream state from useBuildStream hook */
	buildStream: BuildStreamState;
	/** Whether to show the component (false hides it) */
	show?: boolean;
	/** Maximum height in pixels */
	maxHeight?: number;
}

/**
 * Formats a log entry for display
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
			// Split output by newlines and render each line
			return (
				<>
					{entry.output?.split("\n").map((line, i) => (
						<div key={i} className="text-green-300 text-xs whitespace-pre-wrap break-all">
							{line}
						</div>
					))}
				</>
			);

		case "build:stderr":
			// Split output by newlines and render each line
			return (
				<>
					{entry.output?.split("\n").map((line, i) => (
						<div key={i} className="text-yellow-300 text-xs whitespace-pre-wrap break-all">
							{line}
						</div>
					))}
				</>
			);

		case "build:command":
			return (
				<div className="text-cyan-400 text-xs font-medium">
					<span className="text-gray-500">[{timestamp}]</span> $ {entry.command}
				</div>
			);

		case "build:state":
			return (
				<div className="text-purple-400 text-xs">
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

export function BuildLogViewer({
	buildStream,
	show = true,
	maxHeight = 400,
}: BuildLogViewerProps): ReactElement | null {
	const logContainerRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new logs arrive
	useEffect(() => {
		if (logContainerRef.current) {
			logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
		}
	}, [buildStream.logs.length]);

	if (!show) {
		return null;
	}

	const { connected, currentStep, totalSteps, logs, completed, failed } = buildStream;

	return (
		<div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden" data-testid="build-log-viewer">
			{/* Header with progress */}
			<div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Terminal className="h-4 w-4 text-gray-400" />
					<span className="text-sm font-medium text-gray-200">Build Output</span>
				</div>
				<div className="flex items-center gap-3">
					{/* Connection status */}
					<div className="flex items-center gap-1">
						<div className={cn("h-2 w-2 rounded-full", connected ? "bg-green-500" : "bg-gray-500")} />
						<span className="text-xs text-gray-400">{connected ? "Connected" : "Disconnected"}</span>
					</div>
					{/* Progress indicator */}
					{totalSteps > 0 && !completed && !failed && (
						<div className="flex items-center gap-2">
							<Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
							<span className="text-xs text-gray-400">
								Step {currentStep}/{totalSteps}
							</span>
						</div>
					)}
					{completed && (
						<div className="flex items-center gap-1">
							<CheckCircle className="h-4 w-4 text-green-400" />
							<span className="text-xs text-green-400">Complete</span>
						</div>
					)}
					{failed && (
						<div className="flex items-center gap-1">
							<AlertCircle className="h-4 w-4 text-red-400" />
							<span className="text-xs text-red-400">Failed</span>
						</div>
					)}
				</div>
			</div>

			{/* Log output */}
			<div
				ref={logContainerRef}
				className="p-4 font-mono text-sm overflow-y-auto"
				style={{ maxHeight: `${maxHeight}px` }}
			>
				{logs.length === 0 ? (
					<div className="text-gray-500 text-center py-4">Waiting for build output...</div>
				) : (
					<div className="space-y-1">
						{logs.map((entry, index) => (
							<div key={index}>{formatLogEntry(entry)}</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
