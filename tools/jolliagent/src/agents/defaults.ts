/**
 * Default maximum output tokens for a single model response.
 * If not explicitly provided by the caller, defaults to 10,000.
 * This value is provider-agnostic; providers may still enforce their own caps.
 */
export function getDefaultMaxOutputTokens(_provider?: "anthropic" | string): number {
	// Allow override via env for large generations
	const fromEnv = process.env.JOLLI_MAX_OUTPUT_TOKENS;
	if (fromEnv) {
		const n = Number(fromEnv);
		if (Number.isFinite(n) && n > 0) {
			return Math.floor(n);
		}
	}
	// Cap single-response output tokens to 8192 unless explicitly overridden.
	return 8_192;
}
