/**
 * OnboardingFsmLog - Dev-only panel showing FSM state transitions.
 *
 * Displays a timeline of FSM state changes with timestamps,
 * intent classification, and state arrows. Only rendered in
 * development mode (process.env.NODE_ENV === "development").
 */

import type { OnboardingFsmTransition } from "jolli-common";
import { ChevronDown, ChevronUp, Workflow } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";

/**
 * Props for OnboardingFsmLog.
 */
export interface OnboardingFsmLogProps {
	/** List of FSM transitions to display */
	transitions: Array<OnboardingFsmTransition>;
}

/**
 * Map FSM states to a short color class for the badge.
 */
function getStateColor(state: string): string {
	if (state === "COMPLETED") {
		return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
	}
	if (state.includes("PROMPT") || state.includes("EXPLAIN")) {
		return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
	}
	if (state.includes("WAITING") || state.includes("INSTALLING") || state.includes("SELECTING")) {
		return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
	}
	if (state.includes("ING")) {
		// Auto states like SCANNING, IMPORTING, GENERATING, etc.
		return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
	}
	return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
}

/**
 * Map intent to a short color class.
 */
function getIntentColor(intent: string): string {
	switch (intent) {
		case "confirm":
			return "text-green-600 dark:text-green-400";
		case "skip":
			return "text-orange-600 dark:text-orange-400";
		case "off_topic":
			return "text-gray-500 dark:text-gray-400";
		case "help":
			return "text-blue-600 dark:text-blue-400";
		default:
			return "text-foreground";
	}
}

/**
 * Format a timestamp for display (HH:MM:SS.mmm).
 */
function formatTime(isoTimestamp: string): string {
	const date = new Date(isoTimestamp);
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
	});
}

export function OnboardingFsmLog({ transitions }: OnboardingFsmLogProps): ReactElement | null {
	const [isExpanded, setIsExpanded] = useState(true);
	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new transitions arrive
	useEffect(() => {
		if (isExpanded && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [transitions.length, isExpanded]);

	// Don't render in production
	if (process.env.NODE_ENV !== "development") {
		return null;
	}

	return (
		<div className="border-t bg-muted/20 text-xs font-mono" data-testid="onboarding-fsm-log">
			{/* Header - always visible */}
			<button
				type="button"
				onClick={() => setIsExpanded(prev => !prev)}
				className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/50 transition-colors"
				data-testid="fsm-log-toggle"
			>
				<div className="flex items-center gap-1.5 text-muted-foreground">
					<Workflow className="h-3 w-3" />
					<span className="font-semibold">FSM Log</span>
					{transitions.length > 0 && <span className="text-muted-foreground/70">({transitions.length})</span>}
					{transitions.length > 0 && (
						<span
							className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${getStateColor(transitions[transitions.length - 1].to)}`}
						>
							{transitions[transitions.length - 1].to}
						</span>
					)}
				</div>
				{isExpanded ? (
					<ChevronDown className="h-3 w-3 text-muted-foreground" />
				) : (
					<ChevronUp className="h-3 w-3 text-muted-foreground" />
				)}
			</button>

			{/* Transition list */}
			{isExpanded && (
				<div ref={scrollRef} className="max-h-[150px] overflow-y-auto border-t" data-testid="fsm-log-entries">
					{transitions.length === 0 ? (
						<p className="text-muted-foreground text-center py-3">No transitions yet</p>
					) : (
						<table className="w-full">
							<thead>
								<tr className="text-muted-foreground/70 border-b">
									<th className="text-left px-3 py-1 font-medium">#</th>
									<th className="text-left px-2 py-1 font-medium">Time</th>
									<th className="text-left px-2 py-1 font-medium">Intent</th>
									<th className="text-left px-2 py-1 font-medium">From</th>
									<th className="text-left px-2 py-1 font-medium" />
									<th className="text-left px-2 py-1 font-medium">To</th>
								</tr>
							</thead>
							<tbody>
								{transitions.map((t, i) => (
									<tr
										key={`${t.timestamp}-${i}`}
										className={`border-b border-border/30 ${t.from === t.to ? "opacity-50" : ""}`}
										data-testid={`fsm-log-entry-${i}`}
									>
										<td className="px-3 py-1 text-muted-foreground/50">{i + 1}</td>
										<td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
											{formatTime(t.timestamp)}
										</td>
										<td className={`px-2 py-1 font-medium ${getIntentColor(t.intent)}`}>
											{t.intent}
										</td>
										<td className="px-2 py-1">
											<span className={`px-1.5 py-0.5 rounded ${getStateColor(t.from)}`}>
												{t.from}
											</span>
										</td>
										<td className="px-1 py-1 text-muted-foreground">
											{t.from !== t.to ? "\u2192" : "="}
										</td>
										<td className="px-2 py-1">
											<span className={`px-1.5 py-0.5 rounded ${getStateColor(t.to)}`}>
												{t.to}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			)}
		</div>
	);
}
