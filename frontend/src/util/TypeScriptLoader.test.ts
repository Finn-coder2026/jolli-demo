import {
	extractErrorsFromDiagnostics,
	getTypeScript,
	isTypeScriptLoaded,
	loadTypeScript,
	runTranspileValidation,
	setTsInstanceForTesting,
	type TsDiagnostic,
	type TypeScriptCompiler,
	validateSyntax,
	validateSyntaxSync,
} from "./TypeScriptLoader";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("TypeScriptLoader", () => {
	describe("isTypeScriptLoaded", () => {
		it("should return false when TypeScript is not loaded", () => {
			// In test environment, TypeScript is not loaded from CDN
			expect(isTypeScriptLoaded()).toBe(false);
		});
	});

	describe("getTypeScript", () => {
		it("should return null when TypeScript is not loaded", () => {
			expect(getTypeScript()).toBeNull();
		});
	});

	describe("validateSyntaxSync", () => {
		it("should return null when TypeScript is not loaded", () => {
			const result = validateSyntaxSync('export default { test: "value" }');
			expect(result).toBeNull();
		});
	});

	describe("extractErrorsFromDiagnostics", () => {
		it("should return empty array for empty diagnostics", () => {
			const result = extractErrorsFromDiagnostics([]);
			expect(result).toEqual([]);
		});

		it("should extract error with string messageText", () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: "Unexpected token",
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			expect(result[0].message).toBe("Unexpected token");
			expect(result[0].line).toBe(1);
			expect(result[0].column).toBe(1);
		});

		it("should extract error with nested messageText object", () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: { messageText: "Nested error message" },
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			expect(result[0].message).toBe("Nested error message");
		});

		it("should extract line and column from file position", () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: "Some error",
					start: 50,
					file: {
						getLineAndCharacterOfPosition: () => ({ line: 4, character: 10 }),
					},
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			expect(result[0].line).toBe(5); // 0-based to 1-based
			expect(result[0].column).toBe(11); // 0-based to 1-based
		});

		it('should adjust line number for "expected" errors at start of line', () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: "',' expected.",
					start: 100,
					file: {
						getLineAndCharacterOfPosition: () => ({ line: 5, character: 1 }), // Column 2 (1-based)
					},
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			// Line should be adjusted from 6 to 5 because column <= 3 and message includes "expected"
			expect(result[0].line).toBe(5);
		});

		it('should NOT adjust line number for "expected" errors NOT at start of line', () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: "',' expected.",
					start: 100,
					file: {
						getLineAndCharacterOfPosition: () => ({ line: 5, character: 10 }), // Column 11 (1-based)
					},
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			// Line should NOT be adjusted because column > 3
			expect(result[0].line).toBe(6);
		});

		it('should NOT adjust line number for "expected" errors on line 1', () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: "',' expected.",
					start: 5,
					file: {
						getLineAndCharacterOfPosition: () => ({ line: 0, character: 1 }), // Line 1, Column 2
					},
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			// Line should NOT be adjusted because it's already line 1
			expect(result[0].line).toBe(1);
		});

		it("should handle multiple diagnostics", () => {
			const diagnostics: Array<TsDiagnostic> = [
				{ messageText: "Error 1" },
				{ messageText: "Error 2" },
				{ messageText: { messageText: "Error 3" } },
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(3);
			expect(result[0].message).toBe("Error 1");
			expect(result[1].message).toBe("Error 2");
			expect(result[2].message).toBe("Error 3");
		});

		it("should use default line/column when start is undefined", () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: "Error without position",
					file: {
						getLineAndCharacterOfPosition: () => ({ line: 10, character: 5 }),
					},
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			// Should use defaults because start is undefined
			expect(result[0].line).toBe(1);
			expect(result[0].column).toBe(1);
		});

		it("should use default line/column when file is undefined", () => {
			const diagnostics: Array<TsDiagnostic> = [
				{
					messageText: "Error without file",
					start: 50,
				},
			];
			const result = extractErrorsFromDiagnostics(diagnostics);
			expect(result).toHaveLength(1);
			// Should use defaults because file is undefined
			expect(result[0].line).toBe(1);
			expect(result[0].column).toBe(1);
		});
	});

	describe("runTranspileValidation", () => {
		it("should return empty array for valid content with no diagnostics", () => {
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({
					outputText: "",
					diagnostics: [],
				}),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};

			const result = runTranspileValidation(mockTs, 'export default { test: "value" }');
			expect(result).toEqual([]);
		});

		it("should return empty array when diagnostics is not present", () => {
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({
					outputText: "",
					// No diagnostics property - tests the case when it's missing
				}),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};

			const result = runTranspileValidation(mockTs, "const x = 1;");
			expect(result).toEqual([]);
		});

		it("should extract errors from diagnostics", () => {
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({
					outputText: "",
					diagnostics: [
						{
							messageText: "Syntax error",
							start: 10,
							file: {
								getLineAndCharacterOfPosition: () => ({ line: 2, character: 5 }),
							},
						},
					],
				}),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};

			const result = runTranspileValidation(mockTs, "invalid code");
			expect(result).toHaveLength(1);
			expect(result[0].message).toBe("Syntax error");
			expect(result[0].line).toBe(3); // 0-based to 1-based
			expect(result[0].column).toBe(6);
		});

		it("should handle transpileModule throwing an Error", () => {
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => {
					throw new Error("Transpile failed");
				},
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};

			const result = runTranspileValidation(mockTs, "broken");
			expect(result).toHaveLength(1);
			expect(result[0].message).toBe("Transpile failed");
			expect(result[0].line).toBe(1);
			expect(result[0].column).toBe(1);
		});

		it("should handle transpileModule throwing a non-Error", () => {
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => {
					throw "String error"; // eslint-disable-line @typescript-eslint/only-throw-error
				},
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};

			const result = runTranspileValidation(mockTs, "broken");
			expect(result).toHaveLength(1);
			expect(result[0].message).toBe("String error");
			expect(result[0].line).toBe(1);
			expect(result[0].column).toBe(1);
		});

		it("should pass correct compiler options", () => {
			let capturedOptions: Record<string, unknown> | undefined;

			const mockTs: TypeScriptCompiler = {
				transpileModule: (_input, options) => {
					capturedOptions = options.compilerOptions;
					return { outputText: "", diagnostics: [] };
				},
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 88 },
			};

			runTranspileValidation(mockTs, "const x = 1;");

			expect(capturedOptions).toBeDefined();
			expect(capturedOptions?.target).toBe(99);
			expect(capturedOptions?.module).toBe(88);
			expect(capturedOptions?.noEmit).toBe(true);
		});
	});

	describe("loadTypeScript with mocked DOM", () => {
		let mockScript: {
			src: string;
			async: boolean;
			onload: (() => void) | null;
			onerror: (() => void) | null;
		};

		beforeEach(() => {
			// Reset tsInstance before each test
			setTsInstanceForTesting(null);

			// Create mock script element
			mockScript = {
				src: "",
				async: false,
				onload: null,
				onerror: null,
			};

			// Mock document.createElement
			vi.spyOn(document, "createElement").mockReturnValue(mockScript as unknown as HTMLElement);

			// Mock document.head.appendChild
			vi.spyOn(document.head, "appendChild").mockImplementation(node => node);
		});

		afterEach(() => {
			vi.restoreAllMocks();
			setTsInstanceForTesting(null);
		});

		it("should return cached instance if already loaded (lines 51-52)", async () => {
			// Pre-set a mock TypeScript instance
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({ outputText: "", diagnostics: [] }),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};
			setTsInstanceForTesting(mockTs);

			const result = await loadTypeScript();

			expect(result).toBe(mockTs);
			// Should NOT create a new script element since it's cached
			expect(document.createElement).not.toHaveBeenCalled();
		});

		it("should resolve with TypeScript when script loads successfully (lines 67-74)", async () => {
			// Set up window.ts for when onload is called
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({ outputText: "", diagnostics: [] }),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};
			(window as unknown as { ts: TypeScriptCompiler }).ts = mockTs;

			// Start loading
			const promise = loadTypeScript();

			// Simulate script load
			expect(mockScript.onload).toBeDefined();
			mockScript.onload?.();

			const result = await promise;
			expect(result).toBe(mockTs);
			expect(document.head.appendChild).toHaveBeenCalled();

			// Cleanup
			delete (window as unknown as { ts?: TypeScriptCompiler }).ts;
		});

		it("should reject when script fails to load (lines 77-79)", async () => {
			// Start loading
			const promise = loadTypeScript();

			// Simulate script error
			expect(mockScript.onerror).toBeDefined();
			mockScript.onerror?.();

			await expect(promise).rejects.toThrow("Failed to load TypeScript from CDN");
		});

		it("should reject when TypeScript is not found on window after load (lines 71-73)", async () => {
			// window.ts is NOT set
			delete (window as unknown as { ts?: TypeScriptCompiler }).ts;

			// Start loading
			const promise = loadTypeScript();

			// Simulate script load but window.ts is undefined
			mockScript.onload?.();

			await expect(promise).rejects.toThrow("TypeScript loaded but not found on window.ts");
		});

		it("should return existing promise if already loading (lines 55-57)", async () => {
			// Set up window.ts
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({ outputText: "", diagnostics: [] }),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};
			(window as unknown as { ts: TypeScriptCompiler }).ts = mockTs;

			// Start two loads at the same time
			const promise1 = loadTypeScript();
			const promise2 = loadTypeScript();

			// Both should be the same promise
			expect(promise1).toBe(promise2);

			// Only one script should be created
			expect(document.createElement).toHaveBeenCalledTimes(1);

			// Complete the load
			mockScript.onload?.();

			const [result1, result2] = await Promise.all([promise1, promise2]);
			expect(result1).toBe(mockTs);
			expect(result2).toBe(mockTs);

			// Cleanup
			delete (window as unknown as { ts?: TypeScriptCompiler }).ts;
		});
	});

	describe("validateSyntax (async)", () => {
		let mockTs: TypeScriptCompiler;

		beforeEach(() => {
			setTsInstanceForTesting(null);

			// Create a mock TypeScript compiler
			mockTs = {
				transpileModule: () => ({ outputText: "", diagnostics: [] }),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};

			// Mock DOM for loadTypeScript
			const mockScript = {
				src: "",
				async: false,
				onload: null as (() => void) | null,
				onerror: null as (() => void) | null,
			};

			vi.spyOn(document, "createElement").mockImplementation(() => {
				// Simulate immediate load
				setTimeout(() => {
					(window as unknown as { ts: TypeScriptCompiler }).ts = mockTs;
					mockScript.onload?.();
				}, 0);
				return mockScript as unknown as HTMLElement;
			});

			vi.spyOn(document.head, "appendChild").mockImplementation(node => node);
		});

		afterEach(() => {
			vi.restoreAllMocks();
			setTsInstanceForTesting(null);
			delete (window as unknown as { ts?: TypeScriptCompiler }).ts;
		});

		it("should validate syntax using loaded TypeScript (lines 197-200)", async () => {
			const result = await validateSyntax('export default { test: "value" }');

			expect(result).toEqual([]);
			expect(document.createElement).toHaveBeenCalled();
		});

		it("should return errors from TypeScript validation", async () => {
			// Set up mock to return diagnostics
			mockTs.transpileModule = () => ({
				outputText: "",
				diagnostics: [
					{
						messageText: "Test error",
						start: 10,
						file: {
							getLineAndCharacterOfPosition: () => ({ line: 1, character: 5 }),
						},
					},
				],
			});

			const result = await validateSyntax("invalid code");

			expect(result).toHaveLength(1);
			expect(result[0].message).toBe("Test error");
			expect(result[0].line).toBe(2);
			expect(result[0].column).toBe(6);
		});
	});

	describe("validateSyntaxSync with loaded instance", () => {
		afterEach(() => {
			setTsInstanceForTesting(null);
		});

		it("should return validation result when TypeScript is loaded (lines 212-213)", () => {
			// Set up mock TypeScript
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({ outputText: "", diagnostics: [] }),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};
			setTsInstanceForTesting(mockTs);

			const result = validateSyntaxSync('export default { test: "value" }');

			expect(result).toEqual([]);
		});

		it("should return errors from TypeScript when loaded", () => {
			const mockTs: TypeScriptCompiler = {
				transpileModule: () => ({
					outputText: "",
					diagnostics: [
						{
							messageText: "Syntax error here",
							start: 5,
							file: {
								getLineAndCharacterOfPosition: () => ({ line: 0, character: 5 }),
							},
						},
					],
				}),
				ScriptTarget: { ESNext: 99 },
				ModuleKind: { ESNext: 99 },
			};
			setTsInstanceForTesting(mockTs);

			const result = validateSyntaxSync("bad code");

			expect(result).not.toBeNull();
			expect(result).toHaveLength(1);
			expect(result?.[0].message).toBe("Syntax error here");
		});
	});
});
