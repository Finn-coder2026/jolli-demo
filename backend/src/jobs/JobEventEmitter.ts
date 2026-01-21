import type { JobEvent } from "../types/JobTypes";
import { EventEmitter } from "node:events";

/**
 * Event emitter for job chaining and event-driven job triggers
 */
export interface JobEventEmitter {
	/**
	 * Emit an event that can trigger other jobs
	 */
	emit: <T = unknown>(eventName: string, eventData: T, sourceJobId?: string) => void;

	/**
	 * Listen for events
	 */
	on: (eventName: string, listener: (event: JobEvent) => void) => void;

	/**
	 * Remove event listener
	 */
	off: (eventName: string, listener: (event: JobEvent) => void) => void;

	/**
	 * Remove all listeners for an event
	 */
	removeAllListeners: (eventName?: string) => void;
}

/**
 * Create a new job event emitter
 */
export function createJobEventEmitter(): JobEventEmitter {
	const emitter = new EventEmitter();

	// Set max listeners to prevent memory leak warnings for many job types
	emitter.setMaxListeners(100);

	return {
		emit<T = unknown>(eventName: string, eventData: T, sourceJobId?: string): void {
			const event: JobEvent<T> = {
				name: eventName,
				data: eventData,
				timestamp: new Date(),
			};
			if (sourceJobId !== undefined) {
				event.sourceJobId = sourceJobId;
			}
			emitter.emit(eventName, event);
		},

		on(eventName: string, listener: (event: JobEvent) => void): void {
			emitter.on(eventName, listener);
		},

		off(eventName: string, listener: (event: JobEvent) => void): void {
			emitter.off(eventName, listener);
		},

		removeAllListeners(eventName?: string): void {
			emitter.removeAllListeners(eventName);
		},
	};
}
