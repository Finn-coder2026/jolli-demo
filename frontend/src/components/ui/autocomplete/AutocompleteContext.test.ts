import type { AutocompleteContext, AutocompleteSuggestion } from "./AutocompleteContext";
import { describe, expect, it } from "vitest";

describe("AutocompleteContext", () => {
	it("should define AutocompleteSuggestion interface correctly", () => {
		const suggestion: AutocompleteSuggestion = {
			text: "test",
			displayText: "Test Display",
			description: "Test Description",
		};

		expect(suggestion.text).toBe("test");
		expect(suggestion.displayText).toBe("Test Display");
		expect(suggestion.description).toBe("Test Description");
	});

	it("should allow AutocompleteSuggestion with optional fields", () => {
		const minimalSuggestion: AutocompleteSuggestion = {
			text: "minimal",
		};

		expect(minimalSuggestion.text).toBe("minimal");
		expect(minimalSuggestion.displayText).toBeUndefined();
		expect(minimalSuggestion.description).toBeUndefined();
	});

	it("should define AutocompleteContext interface with getSuggestion", () => {
		const context: AutocompleteContext = {
			getSuggestion: (text: string, _cursorPosition: number) => ({
				text,
				displayText: text.toUpperCase(),
			}),
		};

		const suggestion = context.getSuggestion("hello", 5);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.text).toBe("hello");
		expect(suggestion?.displayText).toBe("HELLO");
	});

	it("should define AutocompleteContext interface with optional getSuggestions", () => {
		const context: AutocompleteContext = {
			getSuggestion: (text: string, _cursorPosition: number) => ({ text }),
			getSuggestions: (prefix: string, _cursorPosition: number) => [
				{ text: `${prefix}1` },
				{ text: `${prefix}2` },
				{ text: `${prefix}3` },
			],
		};

		const suggestions = context.getSuggestions?.("test", 4);
		expect(suggestions).toHaveLength(3);
		expect(suggestions?.[0].text).toBe("test1");
		expect(suggestions?.[1].text).toBe("test2");
		expect(suggestions?.[2].text).toBe("test3");
	});

	it("should allow AutocompleteContext without getSuggestions", () => {
		const context: AutocompleteContext = {
			getSuggestion: (text: string, _cursorPosition: number) => ({ text }),
		};

		const suggestion = context.getSuggestion("test", 4);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.text).toBe("test");
		expect(context.getSuggestions).toBeUndefined();
	});

	it("should allow getSuggestion to return suggestion with all fields", () => {
		const context: AutocompleteContext = {
			getSuggestion: (text: string, _cursorPosition: number) => ({
				text,
				displayText: `Display: ${text}`,
				description: `Description for ${text}`,
			}),
		};

		const suggestion = context.getSuggestion("example", 7);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.text).toBe("example");
		expect(suggestion?.displayText).toBe("Display: example");
		expect(suggestion?.description).toBe("Description for example");
	});
});
