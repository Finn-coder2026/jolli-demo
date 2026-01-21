/**
 * Dynamic TypeScript compiler loader.
 * Loads the TypeScript compiler from CDN at runtime to avoid bundling it (~5MB).
 * Used for client-side syntax validation with accurate line numbers.
 */

/** TypeScript compiler interface (subset of what we need) */
export interface TypeScriptCompiler {
	transpileModule: (
		input: string,
		options: {
			compilerOptions?: Record<string, unknown>;
			reportDiagnostics?: boolean;
		},
	) => {
		outputText: string;
		diagnostics?: Array<{
			messageText: string | { messageText: string };
			start?: number;
			length?: number;
			file?: {
				getLineAndCharacterOfPosition: (pos: number) => { line: number; character: number };
			};
		}>;
	};
	ScriptTarget: {
		ESNext: number;
	};
	ModuleKind: {
		ESNext: number;
	};
}

/** Global TypeScript instance loaded from CDN */
let tsInstance: TypeScriptCompiler | null = null;

/** Promise for loading TypeScript (to avoid multiple loads) */
let loadPromise: Promise<TypeScriptCompiler> | null = null;

/**
 * Set TypeScript instance for testing purposes.
 * @internal Only use this for testing
 */
export function setTsInstanceForTesting(ts: TypeScriptCompiler | null): void {
	tsInstance = ts;
	loadPromise = null;
}

/** CDN URL for TypeScript compiler */
const TS_CDN_URL = "https://cdn.jsdelivr.net/npm/typescript@5.3.3/lib/typescript.min.js";

/**
 * Load TypeScript compiler from CDN.
 * Returns cached instance if already loaded.
 * Only loads once, subsequent calls return the same promise.
 */
export function loadTypeScript(): Promise<TypeScriptCompiler> {
	// Return cached instance if available
	if (tsInstance) {
		return Promise.resolve(tsInstance);
	}

	// Return existing load promise if already loading
	if (loadPromise) {
		return loadPromise;
	}

	// Start loading
	loadPromise = new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = TS_CDN_URL;
		script.async = true;

		script.onload = () => {
			// TypeScript attaches itself to window.ts
			const ts = (window as unknown as { ts: TypeScriptCompiler }).ts;
			if (ts) {
				tsInstance = ts;
				resolve(ts);
			} else {
				reject(new Error("TypeScript loaded but not found on window.ts"));
			}
		};

		script.onerror = () => {
			loadPromise = null; // Allow retry
			reject(new Error("Failed to load TypeScript from CDN"));
		};

		document.head.appendChild(script);
	});

	return loadPromise;
}

/**
 * Check if TypeScript compiler is already loaded.
 */
export function isTypeScriptLoaded(): boolean {
	return tsInstance !== null;
}

/**
 * Get the cached TypeScript compiler instance.
 * Returns null if not yet loaded - use loadTypeScript() to load it first.
 */
export function getTypeScript(): TypeScriptCompiler | null {
	return tsInstance;
}

/** Syntax error with accurate line/column information */
export interface SyntaxError {
	message: string;
	line: number;
	column: number;
}

/** TypeScript diagnostic from transpileModule result */
export interface TsDiagnostic {
	messageText: string | { messageText: string };
	start?: number;
	file?: {
		getLineAndCharacterOfPosition: (pos: number) => { line: number; character: number };
	};
}

/**
 * Extract errors from TypeScript diagnostics.
 * Shared logic between sync and async validation.
 * Exported for testing.
 */
export function extractErrorsFromDiagnostics(diagnostics: Array<TsDiagnostic>): Array<SyntaxError> {
	const errors: Array<SyntaxError> = [];

	for (const diagnostic of diagnostics) {
		// Extract message text
		let message: string;
		if (typeof diagnostic.messageText === "string") {
			message = diagnostic.messageText;
		} else {
			message = diagnostic.messageText.messageText;
		}

		// Get line and column from position
		let line = 1;
		let column = 1;

		if (diagnostic.start !== undefined && diagnostic.file) {
			const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
			// TypeScript returns 0-based line/column, convert to 1-based for display
			line = pos.line + 1;
			column = pos.character + 1;

			// For "expected" errors at the start of a line (missing comma/semicolon from previous line),
			// TypeScript points to where it got confused, but users expect the error on the previous line.
			// Only adjust if the error is near the beginning of the line (first few characters after whitespace).
			if (message.includes("expected") && line > 1 && column <= 3) {
				line = line - 1;
			}
		}

		errors.push({ message, line, column });
	}

	return errors;
}

/**
 * Run TypeScript transpileModule and extract diagnostics.
 * Exported for testing.
 */
export function runTranspileValidation(ts: TypeScriptCompiler, content: string): Array<SyntaxError> {
	try {
		const result = ts.transpileModule(content, {
			compilerOptions: {
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext,
				noEmit: true,
			},
			reportDiagnostics: true,
		});

		if (result.diagnostics && result.diagnostics.length > 0) {
			return extractErrorsFromDiagnostics(result.diagnostics as Array<TsDiagnostic>);
		}

		return [];
	} catch (error) {
		return [
			{
				message: error instanceof Error ? error.message : String(error),
				line: 1,
				column: 1,
			},
		];
	}
}

/**
 * Validate TypeScript/JavaScript syntax and return errors with accurate line numbers.
 * Uses the TypeScript compiler for parsing.
 *
 * @param content - The TypeScript/JavaScript content to validate
 * @returns Array of syntax errors with line/column info, or empty array if valid
 */
export async function validateSyntax(content: string): Promise<Array<SyntaxError>> {
	const ts = await loadTypeScript();
	return runTranspileValidation(ts, content);
}

/**
 * Synchronous validation using cached TypeScript instance.
 * Returns null if TypeScript is not yet loaded.
 * Use this for debounced validation where you don't want to wait for load.
 */
export function validateSyntaxSync(content: string): Array<SyntaxError> | null {
	const ts = getTypeScript();
	if (!ts) {
		return null; // Not loaded yet
	}
	return runTranspileValidation(ts, content);
}
