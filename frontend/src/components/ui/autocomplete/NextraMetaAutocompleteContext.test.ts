import {
	type ArticleInfo,
	NextraMetaAutocompleteContext,
	type NextraMetaAutocompleteOptions,
} from "./NextraMetaAutocompleteContext";
import { describe, expect, it } from "vitest";

describe("NextraMetaAutocompleteContext", () => {
	const testArticles: Array<ArticleInfo> = [
		{ slug: "getting-started", title: "Getting Started Guide" },
		{ slug: "installation", title: "Installation Instructions" },
		{ slug: "api-reference", title: "API Reference" },
		{ slug: "configuration", title: "Configuration Options" },
	];

	describe("constructor", () => {
		it("should create context with articles", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			expect(context).toBeDefined();
		});

		it("should handle empty articles array", () => {
			const context = new NextraMetaAutocompleteContext([]);
			expect(context).toBeDefined();
			expect(context.getSuggestion("", 0)).toBeNull();
		});
	});

	describe("getSuggestion", () => {
		it("should return null for empty content", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Empty content in the middle of a line
			expect(context.getSuggestion("export default {", 16)).toBeNull();
		});

		it("should return first suggestion when multiple available", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = "export default {\n  get";
			const suggestion = context.getSuggestion(content, content.length);

			expect(suggestion).not.toBeNull();
			expect(suggestion?.displayText).toBe("getting-started");
		});
	});

	describe("getSuggestions - object key context", () => {
		it("should suggest article slugs at object key position", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = "export default {\n  get";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
			const gettingStarted = suggestions.find(s => s.displayText === "getting-started");
			expect(gettingStarted).toBeDefined();
			expect(gettingStarted?.text).toBe("ting-started");
		});

		it("should suggest Nextra keywords at object key position", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = "export default {\n  tit";
			const suggestions = context.getSuggestions(content, content.length);

			const titleKeyword = suggestions.find(s => s.displayText === "title");
			expect(titleKeyword).toBeDefined();
			expect(titleKeyword?.text).toBe("le");
		});

		it("should filter out slugs already in content", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// "getting-started" is already in the content
			const content = 'export default {\n  "getting-started": "Getting Started",\n  get';
			const suggestions = context.getSuggestions(content, content.length);

			const gettingStarted = suggestions.find(s => s.displayText === "getting-started");
			expect(gettingStarted).toBeUndefined();
		});

		it("should filter suggestions by prefix", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = "export default {\n  inst";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.every(s => s.displayText?.startsWith("inst"))).toBe(true);
		});

		it("should suggest when typing with quote prefix", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// After accepting a suggestion and starting to type a new entry with quote
			const content = "export default {\n  'getting-started': 'Getting Started',\n  'g";
			const suggestions = context.getSuggestions(content, content.length);

			// Should not suggest getting-started (already exists)
			const gettingStarted = suggestions.find(s => s.displayText === "getting-started");
			expect(gettingStarted).toBeUndefined();

			// Should still suggest other articles starting with 'g' if any exist
			// In this case, no other articles start with 'g', so check keywords
			expect(Array.isArray(suggestions)).toBe(true);
		});

		it("should suggest when typing without quote on new line after existing entry", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// After accepting a suggestion and starting to type a new entry without quote
			const content = "export default {\n  'getting-started': 'Getting Started',\n  i";
			const suggestions = context.getSuggestions(content, content.length);

			// Should suggest 'installation' which starts with 'i'
			const installation = suggestions.find(s => s.displayText === "installation");
			expect(installation).toBeDefined();
			expect(installation?.text).toBe("nstallation");
		});
	});

	describe("getSuggestions - after type colon", () => {
		it("should suggest page types after type:", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = 'export default {\n  "getting-started": {\n    type: "p';
			const suggestions = context.getSuggestions(content, content.length);

			const pageSuggestion = suggestions.find(s => s.displayText === "page");
			expect(pageSuggestion).toBeDefined();
			expect(pageSuggestion?.text).toBe("age");
		});

		it("should suggest all page types when no prefix", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = 'export default {\n  "getting-started": {\n    type: "';
			const suggestions = context.getSuggestions(content, content.length);

			const types = suggestions.map(s => s.displayText);
			expect(types).toContain("page");
			expect(types).toContain("menu");
			expect(types).toContain("separator");
			expect(types).toContain("doc");
		});
	});

	describe("getSuggestions - after colon (value context)", () => {
		it("should suggest article title when key matches article slug", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// After "getting-started": "
			const content = 'export default {\n  "getting-started": "';
			const suggestions = context.getSuggestions(content, content.length);

			// Should suggest the title for "getting-started"
			const titleSuggestion = suggestions.find(s => s.displayText === "Getting Started Guide");
			expect(titleSuggestion).toBeDefined();
		});

		it("should suggest article title with prefix filtering", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = 'export default {\n  "getting-started": "Get';
			const suggestions = context.getSuggestions(content, content.length);

			const titleSuggestion = suggestions.find(s => s.displayText === "Getting Started Guide");
			expect(titleSuggestion).toBeDefined();
			expect(titleSuggestion?.text).toBe("ting Started Guide");
		});
	});

	describe("getSuggestions - new line context", () => {
		it("should suggest full entry templates on empty line", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = "export default {\n  ";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
			// Should contain full entry templates with single quotes
			const firstSuggestion = suggestions[0];
			expect(firstSuggestion.text).toContain("'");
			expect(firstSuggestion.text).toContain(":");
		});

		it("should not suggest articles already in file on new line", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = 'export default {\n  "getting-started": "Getting Started",\n  ';
			const suggestions = context.getSuggestions(content, content.length);

			// "getting-started" should not be suggested
			const gettingStartedSuggestion = suggestions.find(s => s.displayText === "getting-started");
			expect(gettingStartedSuggestion).toBeUndefined();
		});
	});

	describe("edge cases", () => {
		it("should handle cursor at beginning of content", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const suggestions = context.getSuggestions("export default {}", 0);
			// May or may not have suggestions depending on context analysis
			expect(Array.isArray(suggestions)).toBe(true);
		});

		it("should handle cursor at end of content", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = "export default {}";
			const suggestions = context.getSuggestions(content, content.length);
			expect(Array.isArray(suggestions)).toBe(true);
		});

		it("should handle multiline content", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = `export default {
  "getting-started": "Getting Started",
  "installation": {
    title: "Install",
    type: "page"
  },
  api`;
			const suggestions = context.getSuggestions(content, content.length);

			const apiReference = suggestions.find(s => s.displayText === "api-reference");
			expect(apiReference).toBeDefined();
		});

		it("should handle special characters in slug", () => {
			const articles: Array<ArticleInfo> = [{ slug: "my-api-v2", title: "My API v2" }];
			const context = new NextraMetaAutocompleteContext(articles);
			const content = "export default {\n  my-ap";
			const suggestions = context.getSuggestions(content, content.length);

			// Should match slug with hyphen
			const apiSuggestion = suggestions.find(s => s.displayText === "my-api-v2");
			expect(apiSuggestion).toBeDefined();
		});
	});

	describe("Nextra keywords", () => {
		it("should include all Nextra keywords in suggestions", () => {
			const context = new NextraMetaAutocompleteContext([]);

			// Check that the system knows about Nextra keywords by typing a prefix
			const contentWithT = "export default {\n  t";
			const suggestionsT = context.getSuggestions(contentWithT, contentWithT.length);

			const hasTitle = suggestionsT.some(s => s.displayText === "title");
			const hasType = suggestionsT.some(s => s.displayText === "type");
			const hasTheme = suggestionsT.some(s => s.displayText === "theme");

			expect(hasTitle || hasType || hasTheme).toBe(true);
		});

		it("should provide descriptions for Nextra keywords", () => {
			const context = new NextraMetaAutocompleteContext([]);
			const content = "export default {\n  typ";
			const suggestions = context.getSuggestions(content, content.length);

			const typeSuggestion = suggestions.find(s => s.displayText === "type");
			expect(typeSuggestion?.description).toBeDefined();
		});
	});

	describe("title key suggestions", () => {
		it("should suggest title based on nearby slug context", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// When typing title after a slug is defined, should suggest based on that slug
			const content = 'export default {\n  "getting-started": {\n    title: "';
			const suggestions = context.getSuggestions(content, content.length);

			// Should suggest "Getting Started Guide" based on nearby slug
			const titleSuggestion = suggestions.find(s => s.displayText === "Getting Started Guide");
			expect(titleSuggestion).toBeDefined();
			expect(titleSuggestion?.text).toBe("Getting Started Guide");
		});

		it("should filter title suggestions by prefix", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = 'export default {\n  "getting-started": {\n    title: "Get';
			const suggestions = context.getSuggestions(content, content.length);

			const titleSuggestion = suggestions.find(s => s.displayText === "Getting Started Guide");
			expect(titleSuggestion).toBeDefined();
			expect(titleSuggestion?.text).toBe("ting Started Guide");
		});

		it("should return empty when title does not match prefix", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			const content = 'export default {\n  "getting-started": {\n    title: "Xyz';
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBe(0);
		});

		it("should skip Nextra keywords when finding nearby slug", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// The keyword "title" should be skipped, and "getting-started" should be found
			const content = 'export default {\n  "getting-started": {\n    type: "page",\n    title: "';
			const suggestions = context.getSuggestions(content, content.length);

			const titleSuggestion = suggestions.find(s => s.displayText === "Getting Started Guide");
			expect(titleSuggestion).toBeDefined();
		});

		it("should return empty when title key has no nearby slug", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// No slug defined before title - only Nextra keywords like "type" are present
			const content = 'export default {\n  title: "';
			const suggestions = context.getSuggestions(content, content.length);

			// No suggestions because there's no nearby article slug to suggest a title for
			expect(suggestions.length).toBe(0);
		});

		it("should return empty when nearby slug is not in articles", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// "unknown-slug" is not in the articles list
			const content = 'export default {\n  "unknown-slug": {\n    title: "';
			const suggestions = context.getSuggestions(content, content.length);

			// No suggestions because the nearby slug is not a known article
			expect(suggestions.length).toBe(0);
		});
	});

	describe("type suggestions filtering", () => {
		it("should filter type suggestions by prefix", () => {
			const context = new NextraMetaAutocompleteContext([]);
			const content = 'export default {\n  "test": {\n    type: "se';
			const suggestions = context.getSuggestions(content, content.length);

			// Should only have "separator" suggestion
			expect(suggestions.length).toBe(1);
			expect(suggestions[0].displayText).toBe("separator");
			expect(suggestions[0].text).toBe("parator");
		});

		it("should return empty when type prefix has no matches", () => {
			const context = new NextraMetaAutocompleteContext([]);
			const content = 'export default {\n  "test": {\n    type: "xyz';
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBe(0);
		});

		it("should not suggest already complete type value", () => {
			const context = new NextraMetaAutocompleteContext([]);
			const content = 'export default {\n  "test": {\n    type: "page';
			const suggestions = context.getSuggestions(content, content.length);

			// "page" is complete, so no remaining text to suggest
			expect(suggestions.length).toBe(0);
		});
	});

	describe("extractExistingSlugs", () => {
		it("should extract all slug formats", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Content has multiple slugs already defined
			const content = `export default {
  "getting-started": "Getting Started",
  'installation': "Install",
  api-reference: "API",
  config`;
			const suggestions = context.getSuggestions(content, content.length);

			// Should not suggest already present slugs
			const gettingStarted = suggestions.find(s => s.displayText === "getting-started");
			const installation = suggestions.find(s => s.displayText === "installation");
			const apiReference = suggestions.find(s => s.displayText === "api-reference");

			expect(gettingStarted).toBeUndefined();
			expect(installation).toBeUndefined();
			expect(apiReference).toBeUndefined();

			// Should suggest "configuration" which starts with "config"
			const configuration = suggestions.find(s => s.displayText === "configuration");
			expect(configuration).toBeDefined();
		});
	});

	describe("null coalescing branches", () => {
		it("should handle undefined key in after-colon context", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// This tests the case where key might be undefined and defaults to empty string
			const content = 'export default {\n  "getting-started": "Get';
			const suggestions = context.getSuggestions(content, content.length);

			// Should still return suggestions using the default empty key
			expect(Array.isArray(suggestions)).toBe(true);
		});

		it("should handle undefined indent in new-line context", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Empty line with no indent
			const content = "export default {\n";
			const suggestions = context.getSuggestions(content, content.length);

			// Should still return suggestions with default empty indent
			expect(Array.isArray(suggestions)).toBe(true);
		});
	});

	describe("curly/smart quote support", () => {
		it("should suggest when typing with curly single quote", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Using right single quotation mark (U+2019) which browsers may auto-insert
			const content = "export default {\n  \u2019";
			const suggestions = context.getSuggestions(content, content.length);

			// Should return suggestions (all articles since prefix is empty after quote)
			expect(suggestions.length).toBeGreaterThan(0);
		});

		it("should suggest when typing with left curly single quote", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Using left single quotation mark (U+2018)
			const content = "export default {\n  \u2018";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
		});

		it("should suggest when typing with curly double quote", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Using left double quotation mark (U+201C)
			const content = "export default {\n  \u201C";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
		});

		it("should extract existing slugs with curly quotes", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Content with curly quotes around slugs
			const content = "export default {\n  \u2018getting-started\u2019: \u201CGetting Started\u201D,\n  inst";
			const suggestions = context.getSuggestions(content, content.length);

			// "getting-started" should not be suggested (already exists with curly quotes)
			const gettingStarted = suggestions.find(s => s.displayText === "getting-started");
			expect(gettingStarted).toBeUndefined();

			// "installation" should be suggested
			const installation = suggestions.find(s => s.displayText === "installation");
			expect(installation).toBeDefined();
		});

		it("should suggest title after curly-quoted slug", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// Using curly quotes: 'getting-started': "
			const content = "export default {\n  \u2018getting-started\u2019: \u201C";
			const suggestions = context.getSuggestions(content, content.length);

			// Should suggest the title for "getting-started"
			const titleSuggestion = suggestions.find(s => s.displayText === "Getting Started Guide");
			expect(titleSuggestion).toBeDefined();
		});
	});

	describe("full entry template suggestions", () => {
		it("should suggest full entry template when quote is typed", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// User types just a quote at the start of a new entry
			const content = "export default {\n  '";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
			// First suggestion should be a full entry template: slug': 'Title',
			const firstSuggestion = suggestions[0];
			expect(firstSuggestion.text).toContain("': '");
			expect(firstSuggestion.text).toContain("',");
		});

		it("should suggest full entry with remaining slug when quote and partial slug typed", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// User types quote and partial slug
			const content = "export default {\n  'get";
			const suggestions = context.getSuggestions(content, content.length);

			const gettingStarted = suggestions.find(s => s.displayText === "getting-started");
			expect(gettingStarted).toBeDefined();
			// Should complete the entry: ting-started': 'Getting Started Guide',
			expect(gettingStarted?.text).toBe("ting-started': 'Getting Started Guide',");
		});

		it("should not include Nextra keywords in full entry template suggestions", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// When quote is typed, only article suggestions should appear, not keywords
			const content = "export default {\n  '";
			const suggestions = context.getSuggestions(content, content.length);

			// Should not contain Nextra keywords like 'title', 'type', etc.
			const titleKeyword = suggestions.find(s => s.displayText === "title");
			const typeKeyword = suggestions.find(s => s.displayText === "type");
			expect(titleKeyword).toBeUndefined();
			expect(typeKeyword).toBeUndefined();
		});

		it("should suggest full entry at position 0 when quote is typed", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// User types quote at position 0
			const content = "'";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
			// Should suggest full entries
			const firstSuggestion = suggestions[0];
			expect(firstSuggestion.text).toContain("': '");
		});

		it("should suggest full entry at position 1 when quote is typed after whitespace", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// User types one space then quote
			const content = " '";
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
			// Should suggest full entries
			const firstSuggestion = suggestions[0];
			expect(firstSuggestion.text).toContain("': '");
		});

		it("should use double quote character when double quote is typed", () => {
			const context = new NextraMetaAutocompleteContext(testArticles);
			// User types double quote
			const content = 'export default {\n  "';
			const suggestions = context.getSuggestions(content, content.length);

			expect(suggestions.length).toBeGreaterThan(0);
			// Should use double quotes in the suggestion
			const firstSuggestion = suggestions[0];
			expect(firstSuggestion.text).toContain('": "');
			expect(firstSuggestion.text).toContain('",');
		});
	});

	describe("folder suggestions", () => {
		const testFolders = ["guides", "tutorials", "api-docs"];
		const optionsWithFolders: NextraMetaAutocompleteOptions = {
			articles: testArticles,
			folders: testFolders,
		};

		describe("constructor with options object", () => {
			it("should create context with articles and folders", () => {
				const context = new NextraMetaAutocompleteContext(optionsWithFolders);
				expect(context).toBeDefined();
			});

			it("should handle options without folders", () => {
				const context = new NextraMetaAutocompleteContext({ articles: testArticles });
				expect(context).toBeDefined();
			});

			it("should maintain backward compatibility with plain array", () => {
				const context = new NextraMetaAutocompleteContext(testArticles);
				expect(context).toBeDefined();
			});
		});

		describe("object key context", () => {
			it("should suggest folder names at object key position", () => {
				const context = new NextraMetaAutocompleteContext(optionsWithFolders);
				const content = "export default {\n  gui";
				const suggestions = context.getSuggestions(content, content.length);

				const guidesFolder = suggestions.find(s => s.displayText === "guides");
				expect(guidesFolder).toBeDefined();
				expect(guidesFolder?.description).toContain("Folder:");
			});

			it("should suggest folders before articles (higher priority)", () => {
				const context = new NextraMetaAutocompleteContext(optionsWithFolders);
				const content = "export default {\n  ";
				const suggestions = context.getSuggestions(content, content.length);

				// Find the position of first folder and first article
				const firstFolderIdx = suggestions.findIndex(s => s.description?.includes("Folder:"));
				const firstArticleIdx = suggestions.findIndex(
					s => !s.description?.includes("Folder:") && !s.description?.includes("Nextra"),
				);

				// Folders should appear before articles
				if (firstFolderIdx >= 0 && firstArticleIdx >= 0) {
					expect(firstFolderIdx).toBeLessThan(firstArticleIdx);
				}
			});

			it("should filter out folders already in content", () => {
				const context = new NextraMetaAutocompleteContext(optionsWithFolders);
				const content = 'export default {\n  "guides": "User Guides",\n  gui';
				const suggestions = context.getSuggestions(content, content.length);

				// "guides" should not be suggested since it's already in content
				const guidesFolder = suggestions.find(s => s.displayText === "guides");
				expect(guidesFolder).toBeUndefined();
			});

			it("should suggest folder with full entry template when quote typed", () => {
				const context = new NextraMetaAutocompleteContext(optionsWithFolders);
				const content = "export default {\n  'gui";
				const suggestions = context.getSuggestions(content, content.length);

				const guidesFolder = suggestions.find(s => s.displayText === "guides");
				expect(guidesFolder).toBeDefined();
				// Should complete as: des': 'Guides',
				expect(guidesFolder?.text).toContain("': '");
				expect(guidesFolder?.text).toContain("',");
			});
		});

		describe("new line context", () => {
			it("should suggest folder entry templates on empty line", () => {
				const context = new NextraMetaAutocompleteContext(optionsWithFolders);
				const content = "export default {\n  ";
				const suggestions = context.getSuggestions(content, content.length);

				// Should have folder suggestions
				const folderSuggestion = suggestions.find(s => s.description?.includes("folder entry"));
				expect(folderSuggestion).toBeDefined();
			});

			it("should not suggest folders already in file on new line", () => {
				const context = new NextraMetaAutocompleteContext(optionsWithFolders);
				const content = 'export default {\n  "guides": "User Guides",\n  ';
				const suggestions = context.getSuggestions(content, content.length);

				// "guides" should not be suggested
				const guidesFolder = suggestions.find(s => s.displayText === "guides");
				expect(guidesFolder).toBeUndefined();
			});
		});

		describe("nested folder paths", () => {
			it("should extract immediate folder name from nested path", () => {
				const nestedFolders = ["guides", "guides/advanced", "tutorials/beginner"];
				const context = new NextraMetaAutocompleteContext({
					articles: testArticles,
					folders: nestedFolders,
				});
				const content = "export default {\n  adv";
				const suggestions = context.getSuggestions(content, content.length);

				// Should suggest "advanced" from "guides/advanced"
				const advancedFolder = suggestions.find(s => s.displayText === "advanced");
				expect(advancedFolder).toBeDefined();
				expect(advancedFolder?.description).toBe("Folder: guides/advanced");
			});

			it("should suggest beginner from nested tutorials/beginner path", () => {
				const nestedFolders = ["tutorials/beginner"];
				const context = new NextraMetaAutocompleteContext({
					articles: testArticles,
					folders: nestedFolders,
				});
				const content = "export default {\n  beg";
				const suggestions = context.getSuggestions(content, content.length);

				const beginnerFolder = suggestions.find(s => s.displayText === "beginner");
				expect(beginnerFolder).toBeDefined();
			});
		});
	});
});
