import type { AutocompleteContext, AutocompleteSuggestion } from "./AutocompleteContext";

/**
 * Article info for autocomplete suggestions.
 */
export interface ArticleInfo {
	/** The URL-safe slug (filename without extension) */
	slug: string;
	/** The human-readable title */
	title: string;
}

/**
 * Options for creating NextraMetaAutocompleteContext.
 */
export interface NextraMetaAutocompleteOptions {
	/** Available articles with slug and title */
	articles: Array<ArticleInfo>;
	/** Content subfolder names (relative to content/) for folder entry suggestions */
	folders?: Array<string>;
}

/**
 * Nextra 4 _meta.ts keywords and their descriptions.
 */
const NEXTRA_KEYWORDS: Array<{ keyword: string; description: string }> = [
	{ keyword: "title", description: "Display title for the page" },
	{ keyword: "type", description: "Page type: page, menu, separator, doc" },
	{ keyword: "href", description: "External link URL" },
	{ keyword: "items", description: "Nested menu items" },
	{ keyword: "display", description: "Display mode: hidden, normal" },
	{ keyword: "theme", description: "Theme configuration object" },
	{ keyword: "newWindow", description: "Open link in new window" },
];

/**
 * Nextra page type values.
 */
const PAGE_TYPES = ["page", "menu", "separator", "doc"];

/**
 * Quote characters pattern for regex matching.
 * Includes straight quotes (' ") and curly/smart quotes (' ' " ").
 * Browsers/OS may auto-convert straight quotes to curly quotes in contenteditable.
 */
const QUOTE_CHARS = `'"\u2018\u2019\u201C\u201D`;

/**
 * Autocomplete context provider for Nextra _meta.ts files.
 * Provides suggestions for article slugs, folder names, titles, and Nextra-specific keywords.
 */
export class NextraMetaAutocompleteContext implements AutocompleteContext {
	private articles: Array<ArticleInfo>;
	private articlesBySlug: Map<string, ArticleInfo>;
	private folders: Array<string>;

	/**
	 * Creates a new NextraMetaAutocompleteContext.
	 * @param articlesOrOptions - Available articles or options object with articles and folders
	 */
	constructor(articlesOrOptions: Array<ArticleInfo> | NextraMetaAutocompleteOptions) {
		if (Array.isArray(articlesOrOptions)) {
			// Backward compatibility: plain array of articles
			this.articles = articlesOrOptions;
			this.folders = [];
		} else {
			// New options object with articles and optional folders
			this.articles = articlesOrOptions.articles;
			this.folders = articlesOrOptions.folders ?? [];
		}
		this.articlesBySlug = new Map(this.articles.map(a => [a.slug, a]));
	}

	/**
	 * Get a single suggestion based on current content and cursor position.
	 */
	getSuggestion(content: string, cursorPosition: number): AutocompleteSuggestion | null {
		const suggestions = this.getSuggestions(content, cursorPosition);
		return suggestions.length > 0 ? suggestions[0] : null;
	}

	/**
	 * Get all available suggestions for the current position.
	 */
	getSuggestions(content: string, cursorPosition: number): Array<AutocompleteSuggestion> {
		const context = this.analyzeContext(content, cursorPosition);

		switch (context.type) {
			case "object-key":
				return this.getSlugSuggestions(
					content,
					context.prefix,
					context.hasQuote ?? false,
					context.quoteChar ?? "'",
				);
			case "after-colon":
				// context.key is always defined when type is "after-colon"
				return this.getValueSuggestions(content, context.key as string, context.prefix);
			case "after-type-colon":
				return this.getTypeSuggestions(context.prefix);
			case "new-line":
				// context.indent is always defined when type is "new-line"
				return this.getNewLineSuggestions(content, context.indent as string);
			default:
				return [];
		}
	}

	/**
	 * Analyzes the editing context to determine what type of suggestion is needed.
	 */
	private analyzeContext(
		content: string,
		cursorPosition: number,
	): {
		type: "object-key" | "after-colon" | "after-type-colon" | "new-line" | "none";
		prefix: string;
		key?: string;
		indent?: string;
		hasQuote?: boolean;
		quoteChar?: string;
	} {
		// Get the text before the cursor
		const beforeCursor = content.slice(0, cursorPosition);
		const lines = beforeCursor.split("\n");
		const currentLine = lines[lines.length - 1];

		// Check if we're on an empty or whitespace-only line (new line context)
		if (/^\s*$/.test(currentLine)) {
			const indentMatch = currentLine.match(/^(\s*)/);
			return { type: "new-line", prefix: "", indent: indentMatch?.[1] || "" };
		}

		// Check if we're typing after "type:" (for page type values)
		const typeColonMatch = currentLine.match(new RegExp(`type\\s*:\\s*[${QUOTE_CHARS}]?(\\w*)$`));
		if (typeColonMatch) {
			return { type: "after-type-colon", prefix: typeColonMatch[1] };
		}

		// Check if we're typing after a key with colon (for value suggestions)
		// Match patterns like: `"getting-started": "` or `"slug": "Get` or `title: "`
		// Slugs can contain hyphens, so use [\w-]+ for the key
		const afterColonMatch = currentLine.match(
			new RegExp(`[${QUOTE_CHARS}]?([\\w-]+)[${QUOTE_CHARS}]?\\s*:\\s*[${QUOTE_CHARS}]?([\\w\\s]*)$`),
		);
		if (afterColonMatch) {
			const key = afterColonMatch[1];
			const prefix = afterColonMatch[2];
			return { type: "after-colon", prefix, key };
		}

		// Check if we're at an object key position (typing a slug or keyword)
		// Match patterns like: `  "get` or `  get` or `  my-ap` or just `  '` at start of object entry
		// Slugs can contain hyphens, so use [\w-]* for the prefix
		// Capture the quote character if present to complete the entry properly
		const objectKeyMatch = currentLine.match(new RegExp(`^\\s*([${QUOTE_CHARS}]?)([\\w-]*)$`));
		if (objectKeyMatch) {
			const quoteChar = objectKeyMatch[1] || "";
			const prefix = objectKeyMatch[2];
			return {
				type: "object-key",
				prefix,
				hasQuote: quoteChar.length > 0,
				quoteChar: quoteChar || "'",
			};
		}

		return { type: "none", prefix: "" };
	}

	/**
	 * Get slug suggestions for object key position.
	 * Filters out slugs already present in the content.
	 * When hasQuote is true, suggests full entry template (slug': 'Title',) to complete the entry.
	 * Also suggests folder names for navigation entries.
	 */
	private getSlugSuggestions(
		content: string,
		prefix: string,
		hasQuote: boolean,
		quoteChar: string,
	): Array<AutocompleteSuggestion> {
		const existingSlugs = this.extractExistingSlugs(content);
		const suggestions: Array<AutocompleteSuggestion> = [];

		// Add folder name suggestions first (higher priority for navigation)
		for (const folderPath of this.folders) {
			// Get the immediate folder name (last segment)
			const folderName = folderPath.split("/").pop() || folderPath;
			if (existingSlugs.has(folderName)) {
				continue;
			}
			if (prefix && !folderName.toLowerCase().startsWith(prefix.toLowerCase())) {
				continue;
			}

			// Suggest the remaining part of the folder name (after prefix)
			const remaining = folderName.slice(prefix.length);
			if (remaining || hasQuote) {
				// When a quote was typed, complete the full entry: folder': 'Folder Title',
				const title = folderName.charAt(0).toUpperCase() + folderName.slice(1).replace(/-/g, " ");
				const text = hasQuote ? `${remaining}${quoteChar}: ${quoteChar}${title}${quoteChar},` : remaining;

				suggestions.push({
					text,
					displayText: folderName,
					description: `Folder: ${folderPath}`,
				});
			}
		}

		// Add article slug suggestions
		for (const article of this.articles) {
			if (existingSlugs.has(article.slug)) {
				continue;
			}
			if (prefix && !article.slug.toLowerCase().startsWith(prefix.toLowerCase())) {
				continue;
			}

			// Suggest the remaining part of the slug (after prefix)
			const remaining = article.slug.slice(prefix.length);
			if (remaining || hasQuote) {
				// When a quote was typed, complete the full entry: slug': 'Title',
				// This allows user to type ' and get the complete entry suggestion
				const text = hasQuote
					? `${remaining}${quoteChar}: ${quoteChar}${article.title}${quoteChar},`
					: remaining;

				suggestions.push({
					text,
					displayText: article.slug,
					description: article.title,
				});
			}
		}

		// Add Nextra keyword suggestions (only when not completing a full entry)
		if (!hasQuote) {
			this.addKeywordSuggestions(suggestions, prefix);
		}

		return suggestions;
	}

	/**
	 * Add Nextra keyword suggestions to the suggestions array.
	 */
	private addKeywordSuggestions(suggestions: Array<AutocompleteSuggestion>, prefix: string): void {
		for (const { keyword, description } of NEXTRA_KEYWORDS) {
			if (prefix && !keyword.toLowerCase().startsWith(prefix.toLowerCase())) {
				continue;
			}
			const remaining = keyword.slice(prefix.length);
			if (remaining) {
				suggestions.push({
					text: remaining,
					displayText: keyword,
					description,
				});
			}
		}
	}

	/**
	 * Get value suggestions after a colon.
	 */
	private getValueSuggestions(content: string, key: string, prefix: string): Array<AutocompleteSuggestion> {
		// If the key matches an article slug, suggest the title
		const article = this.articlesBySlug.get(key);
		if (article) {
			const title = article.title;
			if (!prefix || title.toLowerCase().startsWith(prefix.toLowerCase())) {
				const remaining = title.slice(prefix.length);
				if (remaining) {
					return [
						{
							text: remaining,
							displayText: title,
							description: `Title for ${key}`,
						},
					];
				}
			}
		}

		// If key is 'title', suggest based on nearby slug context
		if (key === "title") {
			const nearbySlug = this.findNearbySlug(content);
			const nearbyArticle = nearbySlug ? this.articlesBySlug.get(nearbySlug) : null;
			if (nearbyArticle) {
				const title = nearbyArticle.title;
				if (!prefix || title.toLowerCase().startsWith(prefix.toLowerCase())) {
					const remaining = title.slice(prefix.length);
					if (remaining) {
						return [
							{
								text: remaining,
								displayText: title,
								description: `Title for ${nearbySlug}`,
							},
						];
					}
				}
			}
		}

		return [];
	}

	/**
	 * Get type value suggestions (page, menu, separator, doc).
	 */
	private getTypeSuggestions(prefix: string): Array<AutocompleteSuggestion> {
		const suggestions: Array<AutocompleteSuggestion> = [];
		for (const type of PAGE_TYPES) {
			if (prefix && !type.toLowerCase().startsWith(prefix.toLowerCase())) {
				continue;
			}
			const remaining = type.slice(prefix.length);
			if (remaining) {
				suggestions.push({
					text: remaining,
					displayText: type,
					description: `Nextra page type: ${type}`,
				});
			}
		}
		return suggestions;
	}

	/**
	 * Get suggestions for a new line (entry templates).
	 */
	private getNewLineSuggestions(content: string, indent: string): Array<AutocompleteSuggestion> {
		const existingSlugs = this.extractExistingSlugs(content);
		const suggestions: Array<AutocompleteSuggestion> = [];

		// Suggest full entry templates for folders not yet in file (higher priority)
		for (const folderPath of this.folders) {
			const folderName = folderPath.split("/").pop() || folderPath;
			if (existingSlugs.has(folderName)) {
				continue;
			}

			// Create a template entry with capitalized title
			const title = folderName.charAt(0).toUpperCase() + folderName.slice(1).replace(/-/g, " ");
			const template = `'${folderName}': '${title}',`;
			suggestions.push({
				text: indent + template,
				displayText: folderName,
				description: `Add folder entry for '${folderPath}'`,
			});
		}

		// Suggest full entry templates for articles not yet in file
		for (const article of this.articles) {
			if (existingSlugs.has(article.slug)) {
				continue;
			}

			// Create a template entry (using single quotes for consistency)
			const template = `'${article.slug}': '${article.title}',`;
			suggestions.push({
				text: indent + template,
				displayText: article.slug,
				description: `Add entry for '${article.title}'`,
			});
		}

		// Limit suggestions to avoid overwhelming
		return suggestions.slice(0, 5);
	}

	/**
	 * Extract slugs that are already present in the _meta.ts content.
	 */
	private extractExistingSlugs(content: string): Set<string> {
		const slugs = new Set<string>();

		// Match patterns like: "slug": or 'slug': or slug:
		const keyPattern = new RegExp(`[${QUOTE_CHARS}]?(\\w[\\w-]*)[${QUOTE_CHARS}]?\\s*:`, "g");
		let match = keyPattern.exec(content);

		while (match !== null) {
			slugs.add(match[1]);
			match = keyPattern.exec(content);
		}

		return slugs;
	}

	/**
	 * Find a nearby slug in the content that might be related to the current context.
	 * Used for suggesting titles based on the slug being configured.
	 */
	private findNearbySlug(content: string): string | null {
		// Look for the most recent slug definition in the content
		const keyPattern = new RegExp(`[${QUOTE_CHARS}]?(\\w[\\w-]*)[${QUOTE_CHARS}]?\\s*:`, "g");
		let lastSlug: string | null = null;
		let match = keyPattern.exec(content);

		while (match !== null) {
			const potentialSlug = match[1];
			// Skip Nextra keywords
			if (!NEXTRA_KEYWORDS.some(k => k.keyword === potentialSlug)) {
				lastSlug = potentialSlug;
			}
			match = keyPattern.exec(content);
		}

		return lastSlug;
	}
}
