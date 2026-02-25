import { convertEmojiShortcodes } from "./EmojiShortcode";

/**
 * Sanitizes Markdown content to be MDX-compatible.
 *
 * MDX is stricter than standard Markdown and doesn't support certain syntax:
 * - HTML comments must be converted to JSX comments
 * - Autolinks must be converted to standard Markdown links
 * - Style tags must be commented out (CSS braces conflict with JSX)
 * - Emoji shortcodes must be converted to unicode emojis
 *
 * Code blocks (fenced and inline) are protected from sanitization so that
 * documentation examples are preserved exactly as written.
 *
 * This function is used both during validation (to check if content will compile)
 * and during site generation (to produce valid .mdx files).
 *
 * @param content - The Markdown content to sanitize
 * @returns MDX-compatible content
 */
export function sanitizeMdToMdx(content: string): string {
	const fencedCodeBlocks: Array<string> = [];
	const inlineCode: Array<string> = [];

	let result = content;

	// Step 1: Extract fenced code blocks (```...```) and replace with placeholders
	// Using a unique prefix to avoid collision with user content
	result = result.replace(/```[\s\S]*?```/g, match => {
		fencedCodeBlocks.push(match);
		return `\x00JOLLI_FENCED_${fencedCodeBlocks.length - 1}\x00`;
	});

	// Step 2: Extract inline code (`...`) and replace with placeholders
	// Handle both single backticks and multiple backticks (`` `code` ``)
	result = result.replace(/`+[^`]+`+/g, match => {
		inlineCode.push(match);
		return `\x00JOLLI_INLINE_${inlineCode.length - 1}\x00`;
	});

	// Step 3: Perform sanitization on the remaining prose content

	// Convert HTML comments to MDX/JSX comments
	// HTML: <!-- comment -->
	// MDX: {/* comment */}
	result = result.replace(/<!--([\s\S]*?)-->/g, "{/*$1*/}");

	// Convert URL autolinks to standard Markdown links
	// Autolink: <https://example.com>
	// Standard: [https://example.com](https://example.com)
	// Only match http:// and https:// URLs to avoid matching JSX tags
	result = result.replace(/<(https?:\/\/[^>]+)>/g, "[$1]($1)");

	// Convert email autolinks to standard Markdown links
	// Autolink: <email@example.com>
	// Standard: [email@example.com](mailto:email@example.com)
	// Email pattern: local-part@domain (simplified but covers common cases)
	result = result.replace(/<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/g, "[$1](mailto:$1)");

	// Comment out style tags (CSS braces conflict with JSX expression parsing)
	// <style>...</style> -> {/* <style>...</style> */}
	result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "{/* $& */}");

	// Step 4: Restore inline code
	// Use a function to avoid special $ pattern interpretation in replacement strings
	for (let i = 0; i < inlineCode.length; i++) {
		result = result.replace(`\x00JOLLI_INLINE_${i}\x00`, () => inlineCode[i]);
	}

	// Step 5: Restore fenced code blocks
	// Use a function to avoid special $ pattern interpretation in replacement strings
	for (let i = 0; i < fencedCodeBlocks.length; i++) {
		result = result.replace(`\x00JOLLI_FENCED_${i}\x00`, () => fencedCodeBlocks[i]);
	}

	// Step 6: Convert emoji shortcodes to unicode emojis
	// This is done after restoring code blocks so convertEmojiShortcodes can do
	// its own code block protection (keeping the emoji conversion logic reusable)
	return convertEmojiShortcodes(result);
}
