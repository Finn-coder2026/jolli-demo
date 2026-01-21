import { GeneratorError, ScannerError } from "./Errors";
import { describe, expect, it } from "vitest";

describe("Error Classes", () => {
	describe("GeneratorError", () => {
		it("should create error with message", () => {
			const error = new GeneratorError("Test error");

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(GeneratorError);
			expect(error.message).toBe("Test error");
		});

		it("should have correct name", () => {
			const error = new GeneratorError("Test");

			expect(error.name).toBe("GeneratorError");
		});

		it("should be throwable", () => {
			expect(() => {
				throw new GeneratorError("Test error");
			}).toThrow(GeneratorError);
		});

		it("should be catchable as Error", () => {
			try {
				throw new GeneratorError("Test error");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("Test error");
			}
		});

		it("should preserve stack trace", () => {
			const error = new GeneratorError("Test");

			expect(error.stack).toBeDefined();
		});
	});

	describe("ScannerError", () => {
		it("should create error with message", () => {
			const error = new ScannerError("Scan failed");

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(ScannerError);
			expect(error.message).toBe("Scan failed");
		});

		it("should have correct name", () => {
			const error = new ScannerError("Test");

			expect(error.name).toBe("ScannerError");
		});

		it("should be throwable", () => {
			expect(() => {
				throw new ScannerError("Scan error");
			}).toThrow(ScannerError);
		});

		it("should be catchable as Error", () => {
			try {
				throw new ScannerError("Scan error");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("Scan error");
			}
		});

		it("should preserve stack trace", () => {
			const error = new ScannerError("Test");

			expect(error.stack).toBeDefined();
		});
	});

	describe("error differentiation", () => {
		it("should distinguish between GeneratorError and ScannerError", () => {
			const genError = new GeneratorError("Gen");
			const scanError = new ScannerError("Scan");

			expect(genError).not.toBeInstanceOf(ScannerError);
			expect(scanError).not.toBeInstanceOf(GeneratorError);
		});

		it("should catch specific error types", () => {
			try {
				throw new GeneratorError("Test");
			} catch (error) {
				if (error instanceof GeneratorError) {
					expect(error.name).toBe("GeneratorError");
				} else {
					throw new Error("Should have caught GeneratorError");
				}
			}
		});
	});
});
