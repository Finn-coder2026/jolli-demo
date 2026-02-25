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

	it("should allow getSuggestion to return null when no suggestion available", () => {
		const context: AutocompleteContext = {
			getSuggestion: (_content: string, _cursorPosition: number) => null,
		};

		const suggestion = context.getSuggestion("some content", 5);
		expect(suggestion).toBeNull();
	});

	it("should allow getSuggestions to return empty array when no suggestions available", () => {
		const context: AutocompleteContext = {
			getSuggestion: (_content: string, _cursorPosition: number) => null,
			getSuggestions: (_content: string, _cursorPosition: number) => [],
		};

		const suggestions = context.getSuggestions?.("some content", 5);
		expect(suggestions).toEqual([]);
	});

	it("should handle empty string content", () => {
		const context: AutocompleteContext = {
			getSuggestion: (content: string, cursorPosition: number) => {
				if (content === "" && cursorPosition === 0) {
					return { text: "start typing..." };
				}
				return null;
			},
		};

		const suggestion = context.getSuggestion("", 0);
		expect(suggestion).not.toBeNull();
		expect(suggestion?.text).toBe("start typing...");
	});

	it("should handle cursor position at different locations", () => {
		const context: AutocompleteContext = {
			getSuggestion: (content: string, cursorPosition: number) => {
				const beforeCursor = content.slice(0, cursorPosition);
				const afterCursor = content.slice(cursorPosition);
				return {
					text: `before:${beforeCursor}|after:${afterCursor}`,
				};
			},
		};

		const suggestion = context.getSuggestion("hello world", 5);
		expect(suggestion?.text).toBe("before:hello|after: world");
	});

	it("should handle cursor at beginning of content", () => {
		const context: AutocompleteContext = {
			getSuggestion: (_content: string, cursorPosition: number) => ({
				text: `position:${cursorPosition}`,
			}),
		};

		const suggestion = context.getSuggestion("some text", 0);
		expect(suggestion?.text).toBe("position:0");
	});

	it("should handle cursor at end of content", () => {
		const content = "some text";
		const context: AutocompleteContext = {
			getSuggestion: (_content: string, cursorPosition: number) => ({
				text: `position:${cursorPosition}`,
			}),
		};

		const suggestion = context.getSuggestion(content, content.length);
		expect(suggestion?.text).toBe("position:9");
	});

	it("should handle multiline content", () => {
		const multilineContent = "line1\nline2\nline3";
		const context: AutocompleteContext = {
			getSuggestion: (content: string, _cursorPosition: number) => ({
				text: content.split("\n").length.toString(),
			}),
		};

		const suggestion = context.getSuggestion(multilineContent, 10);
		expect(suggestion?.text).toBe("3");
	});

	it("should handle special characters in content", () => {
		const specialContent = `const x = \`template \${value}\``;
		const context: AutocompleteContext = {
			getSuggestion: (content: string, _cursorPosition: number) => ({
				text: content,
			}),
		};

		const suggestion = context.getSuggestion(specialContent, 15);
		expect(suggestion?.text).toBe(specialContent);
	});

	it("should handle unicode content", () => {
		const unicodeContent = "Hello 世界 🌍";
		const context: AutocompleteContext = {
			getSuggestion: (content: string, _cursorPosition: number) => ({
				text: content,
				displayText: `Display: ${content}`,
			}),
		};

		const suggestion = context.getSuggestion(unicodeContent, 5);
		expect(suggestion?.text).toBe(unicodeContent);
		expect(suggestion?.displayText).toBe(`Display: ${unicodeContent}`);
	});

	it("should allow getSuggestions to return suggestions with mixed optional fields", () => {
		const context: AutocompleteContext = {
			getSuggestion: () => null,
			getSuggestions: () => [
				{ text: "minimal" },
				{ text: "with-display", displayText: "With Display" },
				{ text: "with-desc", description: "With Description" },
				{ text: "full", displayText: "Full Display", description: "Full Description" },
			],
		};

		const suggestions = context.getSuggestions?.("", 0);
		expect(suggestions).toHaveLength(4);
		expect(suggestions?.[0]).toEqual({ text: "minimal" });
		expect(suggestions?.[1]).toEqual({ text: "with-display", displayText: "With Display" });
		expect(suggestions?.[2]).toEqual({ text: "with-desc", description: "With Description" });
		expect(suggestions?.[3]).toEqual({
			text: "full",
			displayText: "Full Display",
			description: "Full Description",
		});
	});
});
