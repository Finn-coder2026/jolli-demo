import { jsonDeepEquals } from "./JsonUtils";
import { describe, expect, it } from "vitest";

describe("JsonUtils", () => {
	describe("jsonDeepEquals", () => {
		// Primitive values
		it("should return true for identical primitive values", () => {
			expect(jsonDeepEquals("hello", "hello")).toBe(true);
			expect(jsonDeepEquals(42, 42)).toBe(true);
			expect(jsonDeepEquals(true, true)).toBe(true);
			expect(jsonDeepEquals(false, false)).toBe(true);
			expect(jsonDeepEquals(null, null)).toBe(true);
		});

		it("should return false for different primitive values", () => {
			expect(jsonDeepEquals("hello", "world")).toBe(false);
			expect(jsonDeepEquals(42, 43)).toBe(false);
			expect(jsonDeepEquals(true, false)).toBe(false);
			expect(jsonDeepEquals(null, "null")).toBe(false);
		});

		it("should return false for different primitive types", () => {
			expect(jsonDeepEquals("42", 42)).toBe(false);
			expect(jsonDeepEquals(0, false)).toBe(false);
			expect(jsonDeepEquals("", null)).toBe(false);
			expect(jsonDeepEquals(1, true)).toBe(false);
		});

		// Empty collections
		it("should return true for empty objects", () => {
			expect(jsonDeepEquals({}, {})).toBe(true);
		});

		it("should return true for empty arrays", () => {
			expect(jsonDeepEquals([], [])).toBe(true);
		});

		it("should return false when comparing empty object to empty array", () => {
			expect(jsonDeepEquals({}, [])).toBe(false);
		});

		// Simple objects
		it("should return true for identical simple objects", () => {
			const obj1 = { name: "John", age: 30 };
			const obj2 = { name: "John", age: 30 };
			expect(jsonDeepEquals(obj1, obj2)).toBe(true);
		});

		it("should return true for objects with same keys in different order", () => {
			const obj1 = { name: "John", age: 30, city: "NYC" };
			const obj2 = { city: "NYC", name: "John", age: 30 };
			expect(jsonDeepEquals(obj1, obj2)).toBe(true);
		});

		it("should return false for objects with different values", () => {
			const obj1 = { name: "John", age: 30 };
			const obj2 = { name: "John", age: 31 };
			expect(jsonDeepEquals(obj1, obj2)).toBe(false);
		});

		it("should return false for objects with different keys", () => {
			const obj1 = { name: "John", age: 30 };
			const obj2 = { name: "John", city: "NYC" };
			expect(jsonDeepEquals(obj1, obj2)).toBe(false);
		});

		it("should return false for objects with different number of keys", () => {
			const obj1 = { name: "John", age: 30 };
			const obj2 = { name: "John", age: 30, city: "NYC" };
			expect(jsonDeepEquals(obj1, obj2)).toBe(false);
		});

		// Simple arrays
		it("should return true for identical arrays", () => {
			const arr1 = [1, 2, 3];
			const arr2 = [1, 2, 3];
			expect(jsonDeepEquals(arr1, arr2)).toBe(true);
		});

		it("should return false for arrays with different values", () => {
			const arr1 = [1, 2, 3];
			const arr2 = [1, 2, 4];
			expect(jsonDeepEquals(arr1, arr2)).toBe(false);
		});

		it("should return false for arrays with different lengths", () => {
			const arr1 = [1, 2, 3];
			const arr2 = [1, 2];
			expect(jsonDeepEquals(arr1, arr2)).toBe(false);
		});

		it("should return false for arrays with same elements in different order", () => {
			const arr1 = [1, 2, 3];
			const arr2 = [3, 2, 1];
			expect(jsonDeepEquals(arr1, arr2)).toBe(false);
		});

		// Nested objects
		it("should return true for deeply nested identical objects", () => {
			const obj1 = {
				user: {
					name: "John",
					address: {
						street: "Main St",
						city: "NYC",
					},
				},
			};
			const obj2 = {
				user: {
					name: "John",
					address: {
						street: "Main St",
						city: "NYC",
					},
				},
			};
			expect(jsonDeepEquals(obj1, obj2)).toBe(true);
		});

		it("should return false for nested objects with different deep values", () => {
			const obj1 = {
				user: {
					name: "John",
					address: {
						street: "Main St",
						city: "NYC",
					},
				},
			};
			const obj2 = {
				user: {
					name: "John",
					address: {
						street: "Main St",
						city: "LA",
					},
				},
			};
			expect(jsonDeepEquals(obj1, obj2)).toBe(false);
		});

		// Nested arrays
		it("should return true for nested arrays", () => {
			const arr1 = [
				[1, 2],
				[3, 4],
			];
			const arr2 = [
				[1, 2],
				[3, 4],
			];
			expect(jsonDeepEquals(arr1, arr2)).toBe(true);
		});

		it("should return false for nested arrays with different values", () => {
			const arr1 = [
				[1, 2],
				[3, 4],
			];
			const arr2 = [
				[1, 2],
				[3, 5],
			];
			expect(jsonDeepEquals(arr1, arr2)).toBe(false);
		});

		// Mixed objects and arrays
		it("should return true for objects containing arrays", () => {
			const obj1 = {
				name: "John",
				scores: [90, 85, 88],
			};
			const obj2 = {
				name: "John",
				scores: [90, 85, 88],
			};
			expect(jsonDeepEquals(obj1, obj2)).toBe(true);
		});

		it("should return true for arrays containing objects", () => {
			const arr1 = [
				{ id: 1, name: "John" },
				{ id: 2, name: "Jane" },
			];
			const arr2 = [
				{ id: 1, name: "John" },
				{ id: 2, name: "Jane" },
			];
			expect(jsonDeepEquals(arr1, arr2)).toBe(true);
		});

		it("should return false for objects with different arrays", () => {
			const obj1 = {
				name: "John",
				scores: [90, 85, 88],
			};
			const obj2 = {
				name: "John",
				scores: [90, 85, 89],
			};
			expect(jsonDeepEquals(obj1, obj2)).toBe(false);
		});

		// Complex nested structures
		it("should handle complex nested structures", () => {
			const obj1 = {
				users: [
					{
						id: 1,
						name: "John",
						roles: ["admin", "user"],
						metadata: {
							created: "2025-01-01",
							updated: null,
						},
					},
				],
				count: 1,
			};
			const obj2 = {
				users: [
					{
						id: 1,
						name: "John",
						roles: ["admin", "user"],
						metadata: {
							created: "2025-01-01",
							updated: null,
						},
					},
				],
				count: 1,
			};
			expect(jsonDeepEquals(obj1, obj2)).toBe(true);
		});

		// Null values
		it("should handle null values in objects", () => {
			const obj1 = { name: "John", age: null };
			const obj2 = { name: "John", age: null };
			expect(jsonDeepEquals(obj1, obj2)).toBe(true);
		});

		it("should return false when comparing null to undefined-like value", () => {
			const obj1 = { name: "John", age: null };
			const obj2 = { name: "John", age: 0 };
			expect(jsonDeepEquals(obj1, obj2)).toBe(false);
		});

		// Edge cases
		it("should handle objects with numeric string keys", () => {
			const obj1 = { "0": "zero", "1": "one" };
			const obj2 = { "0": "zero", "1": "one" };
			expect(jsonDeepEquals(obj1, obj2)).toBe(true);
		});

		it("should handle arrays with null values", () => {
			const arr1 = [1, null, 3];
			const arr2 = [1, null, 3];
			expect(jsonDeepEquals(arr1, arr2)).toBe(true);
		});

		it("should handle mixed types in arrays", () => {
			const arr1 = [1, "two", true, null, { key: "value" }];
			const arr2 = [1, "two", true, null, { key: "value" }];
			expect(jsonDeepEquals(arr1, arr2)).toBe(true);
		});
	});
});
