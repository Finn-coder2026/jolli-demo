import { useInput } from "ink";

export function useKeyboardShortcuts(
	_viewMode: string,
	setViewMode: (value: string | ((prev: string) => string)) => void,
	isLoading: boolean,
	clearLastChar?: (char: string) => void,
): void {
	// Handle Ctrl+L to toggle convo list
	useInput((input, key) => {
		if (key.ctrl && input === "l" && !isLoading) {
			setViewMode(prev => (prev === "chat" ? "conversations" : "chat"));
			// Clear the "l" character that might have been typed in the input box
			clearLastChar?.(input);
		}
	});
}
