import { TextDecoder, TextEncoder } from "node:util";

// Global setup that runs before any tests or imports
// This ensures TextEncoder/TextDecoder are available for esbuild (used by intlayer)
export default function setup() {
	// Fix TextEncoder/TextDecoder for esbuild (used by intlayer)
	// jsdom's polyfills don't satisfy esbuild's invariant checks
	// biome-ignore lint/suspicious/noExplicitAny: required for global type override
	global.TextEncoder = TextEncoder as any;
	// biome-ignore lint/suspicious/noExplicitAny: required for global type override
	global.TextDecoder = TextDecoder as any;
}
