/**
 * Vitest setup file for React + jsdom compatibility
 */

// Suppress React act() warnings in tests
// These warnings are often false positives when testing async hooks
const originalError = console.error;
beforeAll(() => {
	console.error = (...args: Array<unknown>) => {
		const message = args[0];
		if (
			typeof message === "string" &&
			(message.includes("Warning: An update to") ||
				message.includes("When testing, code that causes React state updates should be wrapped into act"))
		) {
			return;
		}
		originalError(...args);
	};
});

afterAll(() => {
	console.error = originalError;
});
