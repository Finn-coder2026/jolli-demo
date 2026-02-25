import { getSpaceColor, getSpaceInitial } from "./SpaceUtil";
import { describe, expect, it } from "vitest";

describe("SpaceUtil", () => {
	describe("getSpaceColor", () => {
		it("should return consistent color for same input", () => {
			const color1 = getSpaceColor("Default Space");
			const color2 = getSpaceColor("Default Space");
			expect(color1).toBe(color2);
		});

		it("should return color from predefined palette", () => {
			const colors = [
				"bg-blue-500",
				"bg-green-500",
				"bg-yellow-500",
				"bg-red-500",
				"bg-purple-500",
				"bg-pink-500",
				"bg-indigo-500",
				"bg-cyan-500",
				"bg-orange-500",
				"bg-teal-500",
			];
			const color = getSpaceColor("Test");
			expect(colors).toContain(color);
		});

		it("should handle empty strings", () => {
			const color = getSpaceColor("");
			expect(color).toBeTruthy();
		});

		it("should handle special characters", () => {
			expect(getSpaceColor("@special")).toBeTruthy();
			expect(getSpaceColor("#hash")).toBeTruthy();
			expect(getSpaceColor("123numbers")).toBeTruthy();
		});

		it("should handle unicode characters", () => {
			expect(getSpaceColor("中文空间")).toBeTruthy();
			expect(getSpaceColor("émoji😀")).toBeTruthy();
		});

		it("should return same color for names starting with same letter", () => {
			const color1 = getSpaceColor("Apple");
			const color2 = getSpaceColor("Apricot");
			expect(color1).toBe(color2);
		});

		it("should return same color for different casing of same letter", () => {
			const color1 = getSpaceColor("apple");
			const color2 = getSpaceColor("Apple");
			expect(color1).toBe(color2);
		});
	});

	describe("getSpaceInitial", () => {
		it("should return uppercase first letter", () => {
			expect(getSpaceInitial("default")).toBe("D");
			expect(getSpaceInitial("test")).toBe("T");
		});

		it("should handle already uppercase", () => {
			expect(getSpaceInitial("DEFAULT")).toBe("D");
		});

		it("should handle empty strings", () => {
			expect(getSpaceInitial("")).toBe("");
		});

		it("should handle special characters", () => {
			expect(getSpaceInitial("@special")).toBe("@");
			expect(getSpaceInitial("#hash")).toBe("#");
		});

		it("should handle unicode", () => {
			expect(getSpaceInitial("中文")).toBeTruthy();
		});

		it("should handle numbers", () => {
			expect(getSpaceInitial("123numbers")).toBe("1");
		});
	});
});
