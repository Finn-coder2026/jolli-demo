/**
 * Simple markdown renderer for terminal
 * Handles basic markdown formatting without external dependencies
 */
export function renderMarkdown(markdown: string): string {
	let text = markdown;

	// Handle code blocks - just indent them
	text = text.replace(/```[\s\S]*?```/g, match => {
		const lines = match.split("\n");
		// Remove the ``` markers
		const code = lines.slice(1, -1).join("\n");
		// Indent the code
		return `\n${code
			.split("\n")
			.map(line => `  ${line}`)
			.join("\n")}\n`;
	});

	// Handle inline code - just show it as-is with backticks
	text = text.replace(/`([^`]+)`/g, "`$1`");

	// Handle bold - keep the text, remove asterisks
	text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
	text = text.replace(/__([^_]+)__/g, "$1");

	// Handle italic - keep the text, remove asterisks/underscores
	text = text.replace(/\*([^*]+)\*/g, "$1");
	text = text.replace(/_([^_]+)_/g, "$1");

	// Handle headers - just show the text with a newline
	text = text.replace(/^#{1,6}\s+(.+)$/gm, "\n$1\n");

	// Handle lists - keep the bullet points
	text = text.replace(/^[\s]*[-*+]\s+(.+)$/gm, "  • $1");
	text = text.replace(/^[\s]*\d+\.\s+(.+)$/gm, "  $1");

	// Handle links - show link text
	text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

	// Handle blockquotes - add > prefix
	text = text.replace(/^>\s+(.+)$/gm, "> $1");

	return text;
}
