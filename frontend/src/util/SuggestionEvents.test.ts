import { emitSuggestionsChanged, SUGGESTIONS_CHANGED_EVENT } from "./SuggestionEvents";
import { describe, expect, it, vi } from "vitest";

describe("SuggestionEvents", () => {
	it("exports the correct event name", () => {
		expect(SUGGESTIONS_CHANGED_EVENT).toBe("jolli:suggestions-changed");
	});

	it("dispatches window event when emitSuggestionsChanged is called", () => {
		const dispatchSpy = vi.spyOn(window, "dispatchEvent");
		emitSuggestionsChanged();

		expect(dispatchSpy).toHaveBeenCalledOnce();
		const dispatchedEvent = dispatchSpy.mock.calls[0][0];
		expect(dispatchedEvent).toBeInstanceOf(Event);
		expect(dispatchedEvent.type).toBe("jolli:suggestions-changed");

		dispatchSpy.mockRestore();
	});

	it("can be received by a window event listener", () => {
		const handler = vi.fn();
		window.addEventListener(SUGGESTIONS_CHANGED_EVENT, handler);

		emitSuggestionsChanged();

		expect(handler).toHaveBeenCalledOnce();
		window.removeEventListener(SUGGESTIONS_CHANGED_EVENT, handler);
	});
});
