import { cn } from "./ClassNameUtils";
import { describe, expect, it } from "vitest";

describe("ClassNameUtils", () => {
	describe("cn", () => {
		it("should combine multiple class names", () => {
			const result = cn("text-red-500", "font-bold");
			expect(result).toBe("text-red-500 font-bold");
		});

		it("should handle conditional classes", () => {
			const shouldHide = false;
			const result = cn("text-red-500", shouldHide && "hidden", "font-bold");
			expect(result).toBe("text-red-500 font-bold");
		});

		it("should merge conflicting Tailwind classes", () => {
			const result = cn("p-4", "p-8");
			expect(result).toBe("p-8");
		});

		it("should handle arrays of classes", () => {
			const result = cn(["text-red-500", "font-bold"]);
			expect(result).toBe("text-red-500 font-bold");
		});

		it("should handle objects with boolean values", () => {
			const result = cn({
				"text-red-500": true,
				"font-bold": false,
				"text-xl": true,
			});
			expect(result).toBe("text-red-500 text-xl");
		});

		it("should handle empty input", () => {
			const result = cn();
			expect(result).toBe("");
		});

		it("should handle undefined and null values", () => {
			const result = cn("text-red-500", undefined, null, "font-bold");
			expect(result).toBe("text-red-500 font-bold");
		});

		it("should merge responsive classes correctly", () => {
			const result = cn("px-2", "md:px-4", "px-3");
			expect(result).toBe("md:px-4 px-3");
		});

		it("should handle complex combinations", () => {
			const isActive = true;
			const result = cn(
				"base-class",
				isActive && "active-class",
				{ "conditional-class": true, "hidden-class": false },
				["array-class"],
			);
			expect(result).toBe("base-class active-class conditional-class array-class");
		});

		it("should merge color classes correctly", () => {
			const result = cn("text-red-500", "text-blue-500");
			expect(result).toBe("text-blue-500");
		});

		it("should merge spacing classes correctly", () => {
			const result = cn("m-4", "mx-8", "my-2");
			expect(result).toBe("m-4 mx-8 my-2");
		});
	});
});
