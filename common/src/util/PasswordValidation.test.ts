import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validatePassword } from "./PasswordValidation";
import { describe, expect, it } from "vitest";

describe("PasswordValidation", () => {
	describe("validatePassword", () => {
		it("should reject empty password", () => {
			const result = validatePassword("");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("required");
		});

		it("should reject password shorter than minimum length", () => {
			const result = validatePassword("Aa1!abc");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("too_short");
		});

		it("should reject password longer than maximum length", () => {
			const result = validatePassword(`${"A".repeat(PASSWORD_MAX_LENGTH + 1)}a1!`);
			expect(result.valid).toBe(false);
			expect(result.error).toBe("too_long");
		});

		it("should reject password without uppercase letter", () => {
			const result = validatePassword("abcdefgh1!");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("needs_uppercase");
		});

		it("should reject password without lowercase letter", () => {
			const result = validatePassword("ABCDEFGH1!");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("needs_lowercase");
		});

		it("should reject password without number", () => {
			const result = validatePassword("Abcdefgh!");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("needs_number");
		});

		it("should reject password without special character", () => {
			const result = validatePassword("Abcdefgh1");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("needs_special");
		});

		it("should reject password containing email prefix", () => {
			const result = validatePassword("Johndoe1!", "johndoe@example.com");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("contains_email");
		});

		it("should reject password containing email prefix case-insensitively", () => {
			const result = validatePassword("JOHNDOEabc1!", "johndoe@example.com");
			expect(result.valid).toBe(false);
			expect(result.error).toBe("contains_email");
		});

		it("should accept valid password at minimum length", () => {
			const result = validatePassword("Abcdef1!");
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it("should accept valid password at maximum length", () => {
			const password = `A${"a".repeat(PASSWORD_MAX_LENGTH - 3)}1!`;
			const result = validatePassword(password);
			expect(result.valid).toBe(true);
		});

		it("should accept valid password with all requirements", () => {
			const result = validatePassword("SecurePass123!");
			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it("should accept password not containing email prefix", () => {
			const result = validatePassword("SecurePass1!", "different@example.com");
			expect(result.valid).toBe(true);
		});

		it("should accept password when email is not provided", () => {
			const result = validatePassword("SecurePass1!");
			expect(result.valid).toBe(true);
		});

		it("should accept password when email has empty prefix", () => {
			const result = validatePassword("SecurePass1!", "@example.com");
			expect(result.valid).toBe(true);
		});

		it("should accept various special characters", () => {
			const specialChars = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")", "_", "+", "-", "="];
			for (const char of specialChars) {
				const result = validatePassword(`Abcdefg1${char}`);
				expect(result.valid).toBe(true);
			}
		});
	});

	describe("constants", () => {
		it("should have minimum length of 8", () => {
			expect(PASSWORD_MIN_LENGTH).toBe(8);
		});

		it("should have maximum length of 36", () => {
			expect(PASSWORD_MAX_LENGTH).toBe(36);
		});
	});
});
