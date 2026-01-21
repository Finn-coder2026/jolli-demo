/**
 * Hook for subscribing to site build progress via Server-Sent Events.
 * Provides real-time build status, step progress, and output logs.
 */

import { getLog } from "../util/Logger";
import { useCallback, useEffect, useRef, useState } from "react";

const log = getLog(import.meta);

/**
 * Build event types from the backend
 */
export type BuildEventType =
	| "build:clear"
	| "build:mode"
	| "build:step"
	| "build:stdout"
	| "build:stderr"
	| "build:command"
	| "build:state"
	| "build:completed"
	| "build:failed";

/**
 * Build log entry for display
 */
export interface BuildLogEntry {
	type: BuildEventType;
	timestamp: Date;
	mode?: "create" | "rebuild";
	step?: number;
	total?: number;
	message?: string;
	output?: string;
	command?: string;
	state?: string;
	error?: string;
	url?: string;
}

/**
 * Build stream state
 */
export interface BuildStreamState {
	/** Whether the SSE connection is active */
	connected: boolean;
	/** Current build mode (create or rebuild) */
	mode: "create" | "rebuild" | null;
	/** Current step number */
	currentStep: number;
	/** Total number of steps */
	totalSteps: number;
	/** Current step message */
	currentMessage: string;
	/** All log entries */
	logs: Array<BuildLogEntry>;
	/** Whether build completed successfully */
	completed: boolean;
	/** Whether build failed */
	failed: boolean;
	/** Final URL on completion */
	finalUrl: string | null;
	/** Error message on failure */
	errorMessage: string | null;
}

/**
 * Hook for subscribing to site build progress.
 *
 * @param siteId - The ID of the site to watch
 * @param status - The current site status (used to determine when to connect)
 * @param onComplete - Callback when build completes (success or failure)
 * @returns Build stream state
 */
export function useBuildStream(siteId: number, status: string | undefined, onComplete?: () => void): BuildStreamState {
	const [state, setState] = useState<BuildStreamState>({
		connected: false,
		mode: null,
		currentStep: 0,
		totalSteps: 0,
		currentMessage: "",
		logs: [],
		completed: false,
		failed: false,
		finalUrl: null,
		errorMessage: null,
	});

	const eventSourceRef = useRef<EventSource | null>(null);
	const onCompleteRef = useRef(onComplete);

	// Keep callback ref updated
	useEffect(() => {
		onCompleteRef.current = onComplete;
	}, [onComplete]);

	const addLogEntry = useCallback((entry: BuildLogEntry) => {
		setState(prev => {
			// De-duplicate build:step events (same step number and message)
			// This prevents duplicate entries when client reconnects and receives buffered events
			if (entry.type === "build:step" && entry.step !== undefined) {
				const isDuplicate = prev.logs.some(
					log => log.type === "build:step" && log.step === entry.step && log.message === entry.message,
				);
				if (isDuplicate) {
					return prev;
				}
			}
			return {
				...prev,
				logs: [...prev.logs, entry],
			};
		});
	}, []);

	useEffect(() => {
		// Only connect when status is "building" or "pending"
		if (status !== "building" && status !== "pending") {
			// Disconnect if status changed
			/* v8 ignore start -- cleanup function handles this case; kept as defensive guard */
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
				setState(prev => ({ ...prev, connected: false }));
			}
			/* v8 ignore stop */
			return;
		}

		// Already connected
		/* v8 ignore start -- defensive guard against concurrent effects */
		if (eventSourceRef.current) {
			return;
		}
		/* v8 ignore stop */

		const url = `/api/sites/${siteId}/build-stream`;
		log.debug({ siteId, url }, "Connecting to build stream");

		const eventSource = new EventSource(url);
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			log.debug({ siteId }, "Build stream connected");
			setState(prev => ({ ...prev, connected: true }));
		};

		eventSource.onmessage = event => {
			try {
				const data = JSON.parse(event.data);
				const timestamp = new Date();

				switch (data.type) {
					case "build:clear":
						// Reset state for new build (clear previous build output)
						setState(prev => ({
							...prev,
							mode: null,
							currentStep: 0,
							totalSteps: 0,
							currentMessage: "",
							logs: [],
							completed: false,
							failed: false,
							finalUrl: null,
							errorMessage: null,
						}));
						break;

					case "build:mode":
						setState(prev => ({
							...prev,
							mode: data.mode,
							totalSteps: data.totalSteps,
						}));
						addLogEntry({ type: "build:mode", timestamp, ...data });
						break;

					case "build:step":
						setState(prev => ({
							...prev,
							currentStep: data.step,
							totalSteps: data.total,
							currentMessage: data.message,
						}));
						addLogEntry({
							type: "build:step",
							timestamp,
							step: data.step,
							total: data.total,
							message: data.message,
						});
						break;

					case "build:stdout":
						addLogEntry({
							type: "build:stdout",
							timestamp,
							step: data.step,
							output: data.output,
						});
						break;

					case "build:stderr":
						addLogEntry({
							type: "build:stderr",
							timestamp,
							step: data.step,
							output: data.output,
						});
						break;

					case "build:command":
						addLogEntry({
							type: "build:command",
							timestamp,
							step: data.step,
							command: data.command,
						});
						break;

					case "build:state":
						addLogEntry({
							type: "build:state",
							timestamp,
							step: data.step,
							state: data.state,
						});
						break;

					case "build:completed":
						setState(prev => ({
							...prev,
							completed: true,
							finalUrl: data.url,
						}));
						addLogEntry({
							type: "build:completed",
							timestamp,
							url: data.url,
						});
						eventSource.close();
						eventSourceRef.current = null;
						onCompleteRef.current?.();
						break;

					case "build:failed":
						setState(prev => ({
							...prev,
							failed: true,
							errorMessage: data.error,
						}));
						addLogEntry({
							type: "build:failed",
							timestamp,
							step: data.step,
							error: data.error,
						});
						eventSource.close();
						eventSourceRef.current = null;
						onCompleteRef.current?.();
						break;
				}
			} catch (error) {
				log.error(error, "Failed to parse build stream event");
			}
		};

		eventSource.onerror = error => {
			log.error({ error }, "Build stream error");
			setState(prev => ({ ...prev, connected: false }));
			// EventSource will auto-reconnect, but we should close on permanent errors
			if (eventSource.readyState === EventSource.CLOSED) {
				eventSourceRef.current = null;
			}
		};

		return () => {
			log.debug({ siteId }, "Closing build stream");
			eventSource.close();
			eventSourceRef.current = null;
		};
	}, [siteId, status, addLogEntry]);

	return state;
}

/**
 * Clears the build stream state (useful for resetting after rebuild)
 */
export function createInitialBuildStreamState(): BuildStreamState {
	return {
		connected: false,
		mode: null,
		currentStep: 0,
		totalSteps: 0,
		currentMessage: "",
		logs: [],
		completed: false,
		failed: false,
		finalUrl: null,
		errorMessage: null,
	};
}
