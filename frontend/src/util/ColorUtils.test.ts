import { getSiteColor } from "./ColorUtils";
import { describe, expect, it } from "vitest";

describe("ColorUtils", () => {
	describe("getSiteColor", () => {
		it("should return a color class for a name", () => {
			const color = getSiteColor("Test Site");
			expect(color).toMatch(/^bg-\w+-500$/);
		});

		it("should return consistent colors for the same name", () => {
			const color1 = getSiteColor("Acme Corp");
			const color2 = getSiteColor("Acme Corp");
			expect(color1).toBe(color2);
		});

		it("should return the same color for names starting with the same letter", () => {
			const color1 = getSiteColor("Apple");
			const color2 = getSiteColor("Amazon");
			expect(color1).toBe(color2);
		});

		it("should handle lowercase first characters", () => {
			const colorUpper = getSiteColor("Apple");
			const colorLower = getSiteColor("apple");
			expect(colorUpper).toBe(colorLower);
		});

		it("should return different colors for different starting letters", () => {
			const colorA = getSiteColor("Alpha");
			const colorB = getSiteColor("Beta");
			// A (65) % 10 = 5, B (66) % 10 = 6 - different indices
			expect(colorA).not.toBe(colorB);
		});

		it("should cycle through palette for letters with same modulo", () => {
			// A (65) % 10 = 5, K (75) % 10 = 5 - same index
			const colorA = getSiteColor("Alpha");
			const colorK = getSiteColor("Kilo");
			expect(colorA).toBe(colorK);
		});
	});
});
