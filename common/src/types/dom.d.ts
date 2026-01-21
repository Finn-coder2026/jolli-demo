/**
 * Minimal DOM type definitions for EventSource-related types used in CollabConvoClient
 * These are browser APIs that need type definitions when compiling in non-browser environments
 */

declare global {
	interface EventSourceInit {
		withCredentials?: boolean;
	}

	// Event listener types for EventSource
	type EventListener = (evt: Event) => void;
	type EventListenerObject = {
		handleEvent(evt: Event): void;
	};
	type EventListenerOrEventListenerObject = EventListener | EventListenerObject;

	// Storage interface for sessionStorage/localStorage
	interface Storage {
		readonly length: number;
		clear(): void;
		getItem(key: string): string | null;
		key(index: number): string | null;
		removeItem(key: string): void;
		setItem(key: string, value: string): void;
	}

	// eslint-disable-next-line no-var
	var sessionStorage: Storage | undefined;
}

// Export to make this a module
export {};
