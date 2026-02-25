import { deepEquals } from "./DeepEquals";
import { describe, expect, it } from "vitest";

describe("deepEquals", () => {
	it("should return true for identical primitives", () => {
		expect(deepEquals(1, 1)).toBe(true);
		expect(deepEquals("hello", "hello")).toBe(true);
		expect(deepEquals(true, true)).toBe(true);
		expect(deepEquals(null, null)).toBe(true);
		expect(deepEquals(undefined, undefined)).toBe(true);
	});

	it("should return false for different primitives", () => {
		expect(deepEquals(1, 2)).toBe(false);
		expect(deepEquals("a", "b")).toBe(false);
		expect(deepEquals(true, false)).toBe(false);
	});

	it("should return false for different types", () => {
		expect(deepEquals(1, "1")).toBe(false);
		expect(deepEquals(null, undefined)).toBe(false);
		expect(deepEquals(0, false)).toBe(false);
		expect(deepEquals(null, {})).toBe(false);
	});

	it("should compare flat objects", () => {
		expect(deepEquals({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
		expect(deepEquals({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
		expect(deepEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
	});

	it("should compare nested objects", () => {
		expect(deepEquals({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })).toBe(true);
		expect(deepEquals({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
	});

	it("should compare arrays", () => {
		expect(deepEquals([1, 2, 3], [1, 2, 3])).toBe(true);
		expect(deepEquals([1, 2, 3], [1, 2, 4])).toBe(false);
		expect(deepEquals([1, 2], [1, 2, 3])).toBe(false);
	});

	it("should compare nested arrays", () => {
		expect(deepEquals([{ a: [1, 2] }], [{ a: [1, 2] }])).toBe(true);
		expect(deepEquals([{ a: [1, 2] }], [{ a: [1, 3] }])).toBe(false);
	});

	it("should distinguish arrays from objects", () => {
		expect(deepEquals([], {})).toBe(false);
	});

	it("should compare Date objects", () => {
		const d1 = new Date("2024-01-01");
		const d2 = new Date("2024-01-01");
		const d3 = new Date("2024-06-15");
		expect(deepEquals(d1, d2)).toBe(true);
		expect(deepEquals(d1, d3)).toBe(false);
	});

	it("should handle undefined vs missing keys", () => {
		expect(deepEquals({ a: undefined }, {})).toBe(false);
	});

	it("should return true for same reference", () => {
		const obj = { a: 1 };
		expect(deepEquals(obj, obj)).toBe(true);
	});
});
