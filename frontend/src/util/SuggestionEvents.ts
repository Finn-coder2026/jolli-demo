/**
 * Cross-component event system for suggestion state changes.
 *
 * Uses the same `window.dispatchEvent(new CustomEvent(...))` pattern
 * that the project already uses for "jolli:spaces-changed" events.
 *
 * When suggestions are created, applied, or dismissed, callers emit
 * this event so that listeners (e.g. the space tree suggestion dots)
 * can refresh their state without tight coupling between components.
 */

/** Window event name for suggestion state changes. */
export const SUGGESTIONS_CHANGED_EVENT = "jolli:suggestions-changed";

/**
 * Emit a suggestions-changed event on the window.
 * Call this after applying, dismissing, or creating a suggestion.
 */
export function emitSuggestionsChanged(): void {
	window.dispatchEvent(new Event(SUGGESTIONS_CHANGED_EVENT));
}

/** Counts section changes that are neither applied nor dismissed. */
export function countPendingChanges(changes: Array<{ applied: boolean; dismissed: boolean }>): number {
	return changes.filter(c => !c.applied && !c.dismissed).length;
}
