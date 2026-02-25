import { nameToEmoji } from "gemoji";

/**
 * Converts emoji shortcodes to their unicode emoji equivalents.
 *
 * This function converts shortcodes like :rocket: to their unicode
 * representation (🚀). This allows users to write familiar shortcode syntax
 * while ensuring emojis render correctly in all contexts (frontend preview,
 * doc sites, etc.) without requiring the gemoji library on the frontend.
 *
 * Code blocks (fenced and inline) are protected from conversion so that
 * documentation examples with shortcodes are preserved exactly as written.
 *
 * @param content - The content to process
 * @returns Content with emoji shortcodes converted to unicode
 *
 * @example
 * convertEmojiShortcodes("Hello :wave:!") // "Hello 👋!"
 * convertEmojiShortcodes(":rocket: Launch") // "🚀 Launch"
 * convertEmojiShortcodes(":unknown:") // ":unknown:" (unchanged)
 * convertEmojiShortcodes("Use `:rocket:` for rockets") // "Use `:rocket:` for rockets" (code preserved)
 */
export function convertEmojiShortcodes(content: string): string {
	const fencedCodeBlocks: Array<string> = [];
	const inlineCode: Array<string> = [];

	let result = content;

	// Step 1: Extract fenced code blocks (```...```) and replace with placeholders
	result = result.replace(/```[\s\S]*?```/g, match => {
		fencedCodeBlocks.push(match);
		return `\x00JOLLI_FENCED_${fencedCodeBlocks.length - 1}\x00`;
	});

	// Step 2: Extract inline code (`...`) and replace with placeholders
	result = result.replace(/`+[^`]+`+/g, match => {
		inlineCode.push(match);
		return `\x00JOLLI_INLINE_${inlineCode.length - 1}\x00`;
	});

	// Step 3: Convert emoji shortcodes to unicode
	// Shortcode: :rocket: -> 🚀, :warning: -> ⚠️
	// Only converts known shortcodes; unknown ones are left as-is
	result = result.replace(/:([a-z0-9_+-]+):/gi, (match, shortcode) => {
		const emoji = nameToEmoji[shortcode.toLowerCase()];
		return emoji ?? match;
	});

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

	return result;
}
