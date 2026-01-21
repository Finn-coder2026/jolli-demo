/**
 * Autocomplete suggestion item.
 */
export interface AutocompleteSuggestion {
	/** The text to insert when accepting the suggestion */
	text: string;
	/** Optional display text (if different from insert text) */
	displayText?: string;
	/** Optional tooltip/description */
	description?: string;
}

/**
 * Interface that autocomplete context providers must implement.
 * Each provider defines suggestions based on the editing context (e.g., Nextra _meta.ts, article content).
 */
export interface AutocompleteContext {
	/**
	 * Get a single suggestion based on current content and cursor position.
	 * This is used for ghost text display.
	 * @param content - The full text content being edited
	 * @param cursorPosition - The cursor position (character offset from start)
	 * @returns A suggestion to show as ghost text, or null if no suggestion
	 */
	getSuggestion(content: string, cursorPosition: number): AutocompleteSuggestion | null;

	/**
	 * Optional: Get a list of all available suggestions for the current position.
	 * This can be used for dropdown menus in the future.
	 * @param content - The full text content being edited
	 * @param cursorPosition - The cursor position (character offset from start)
	 * @returns Array of suggestions, or empty array if none
	 */
	getSuggestions?(content: string, cursorPosition: number): Array<AutocompleteSuggestion>;
}
