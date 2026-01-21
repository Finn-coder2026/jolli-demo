import { areArraysEqual, excludeFields, isPrimitiveNumber } from "./ObjectUtils";
import { describe, expect, it } from "vitest";

describe("ObjectUtils", () => {
	describe("excludeFields", () => {
		it("should exclude a single field from an object", () => {
			const obj = { name: "John", age: 30, city: "NYC" };
			const result = excludeFields(obj, ["age"]);

			expect(result).toEqual({ name: "John", city: "NYC" });
			expect(result).not.toHaveProperty("age");
		});

		it("should exclude multiple fields from an object", () => {
			const obj = { name: "John", age: 30, city: "NYC", country: "USA" };
			const result = excludeFields(obj, ["age", "country"]);

			expect(result).toEqual({ name: "John", city: "NYC" });
			expect(result).not.toHaveProperty("age");
			expect(result).not.toHaveProperty("country");
		});

		it("should return a copy when no fields are excluded", () => {
			const obj = { name: "John", age: 30 };
			const result = excludeFields(obj, []);

			expect(result).toEqual(obj);
			expect(result).not.toBe(obj); // Should be a new object
		});

		it("should handle excluding all fields", () => {
			const obj = { name: "John", age: 30 };
			const result = excludeFields(obj, ["name", "age"]);

			expect(result).toEqual({});
		});

		it("should not mutate the original object", () => {
			const obj = { name: "John", age: 30, city: "NYC" };
			const original = { ...obj };

			excludeFields(obj, ["age"]);

			expect(obj).toEqual(original);
		});

		it("should handle objects with different value types", () => {
			const obj = {
				name: "John",
				age: 30,
				active: true,
				scores: [90, 85, 88],
				metadata: { created: "2025-01-01" },
			};
			const result = excludeFields(obj, ["age", "active"]);

			expect(result).toEqual({
				name: "John",
				scores: [90, 85, 88],
				metadata: { created: "2025-01-01" },
			});
		});

		it("should handle excluding nested object properties", () => {
			const obj = {
				name: "John",
				address: { street: "Main St", city: "NYC" },
				age: 30,
			};
			const result = excludeFields(obj, ["age"]);

			expect(result).toEqual({
				name: "John",
				address: { street: "Main St", city: "NYC" },
			});
		});

		it("should handle objects with null values", () => {
			const obj = { name: "John", age: null, city: "NYC" };
			const result = excludeFields(obj, ["age"]);

			expect(result).toEqual({ name: "John", city: "NYC" });
		});

		it("should handle objects with undefined values", () => {
			const obj = { name: "John", age: undefined, city: "NYC" };
			const result = excludeFields(obj, ["age"]);

			expect(result).toEqual({ name: "John", city: "NYC" });
		});

		it("should handle excluding non-existent fields gracefully", () => {
			const obj = { name: "John", age: 30 };
			// TypeScript won't allow this normally, but testing runtime behavior
			const result = excludeFields(obj, ["city" as keyof typeof obj]);

			expect(result).toEqual({ name: "John", age: 30 });
		});

		it("should preserve property order for remaining fields", () => {
			const obj = { a: 1, b: 2, c: 3, d: 4 };
			const result = excludeFields(obj, ["b", "d"]);

			const keys = Object.keys(result);
			expect(keys).toEqual(["a", "c"]);
		});

		it("should handle objects with numeric keys", () => {
			const obj = { "0": "zero", "1": "one", "2": "two" };
			const result = excludeFields(obj, ["1"]);

			expect(result).toEqual({ "0": "zero", "2": "two" });
		});

		it("should handle objects with symbol-like string keys", () => {
			const obj = { name: "John", "@id": "123", $type: "user" };
			const result = excludeFields(obj, ["@id"]);

			expect(result).toEqual({ name: "John", $type: "user" });
		});

		it("should return correct type for excluded fields", () => {
			interface User {
				id: number;
				name: string;
				email: string;
				password: string;
			}

			const user: User = {
				id: 1,
				name: "John",
				email: "john@example.com",
				password: "secret",
			};

			const result = excludeFields(user, ["password"]);

			// TypeScript should infer the type as Omit<User, "password">
			expect(result).toEqual({
				id: 1,
				name: "John",
				email: "john@example.com",
			});
			expect(result).not.toHaveProperty("password");
		});

		it("should handle excluding multiple fields with correct typing", () => {
			interface Product {
				id: number;
				name: string;
				price: number;
				internalCost: number;
				supplierId: string;
			}

			const product: Product = {
				id: 1,
				name: "Widget",
				price: 29.99,
				internalCost: 15.0,
				supplierId: "SUP-123",
			};

			const result = excludeFields(product, ["internalCost", "supplierId"]);

			expect(result).toEqual({
				id: 1,
				name: "Widget",
				price: 29.99,
			});
		});

		it("should create a shallow copy of nested objects", () => {
			const nested = { city: "NYC" };
			const obj = { name: "John", age: 30, address: nested };
			const result = excludeFields(obj, ["age"]);

			expect(result.address).toBe(nested); // Same reference
		});

		it("should handle empty object", () => {
			const obj = {};
			const result = excludeFields(obj, []);

			expect(result).toEqual({});
		});
	});

	describe("isPrimitiveNumber", () => {
		it("should return true for primitive numbers", () => {
			expect(isPrimitiveNumber(0)).toBe(true);
			expect(isPrimitiveNumber(1)).toBe(true);
			expect(isPrimitiveNumber(-1)).toBe(true);
			expect(isPrimitiveNumber(3.14)).toBe(true);
			expect(isPrimitiveNumber(Number.MAX_VALUE)).toBe(true);
			expect(isPrimitiveNumber(Number.MIN_VALUE)).toBe(true);
			expect(isPrimitiveNumber(Number.POSITIVE_INFINITY)).toBe(true);
			expect(isPrimitiveNumber(Number.NEGATIVE_INFINITY)).toBe(true);
		});

		it("should return true for NaN", () => {
			expect(isPrimitiveNumber(Number.NaN)).toBe(true);
		});

		it("should return false for non-number primitives", () => {
			expect(isPrimitiveNumber("123")).toBe(false);
			expect(isPrimitiveNumber(true)).toBe(false);
			expect(isPrimitiveNumber(false)).toBe(false);
			expect(isPrimitiveNumber(null)).toBe(false);
			expect(isPrimitiveNumber(undefined)).toBe(false);
		});

		it("should return false for objects", () => {
			expect(isPrimitiveNumber({})).toBe(false);
			expect(isPrimitiveNumber([])).toBe(false);
			// biome-ignore lint/style/useConsistentBuiltinInstantiation: Testing boxed Number object vs primitive
			expect(isPrimitiveNumber(new Number(123))).toBe(false);
			expect(isPrimitiveNumber({ value: 123 })).toBe(false);
		});

		it("should return false for functions", () => {
			expect(isPrimitiveNumber(() => 123)).toBe(false);
			// biome-ignore lint/suspicious/noEmptyBlockStatements: Testing empty function
			// biome-ignore lint/complexity/useArrowFunction: Testing function expression
			expect(isPrimitiveNumber(function () {})).toBe(false);
		});
	});

	describe("areArraysEqual", () => {
		it("should return true for two empty arrays", () => {
			expect(areArraysEqual([], [])).toBe(true);
		});

		it("should return true for two identical arrays", () => {
			expect(areArraysEqual([1, 2, 3], [1, 2, 3])).toBe(true);
			expect(areArraysEqual(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
		});

		it("should return false for arrays with different lengths", () => {
			expect(areArraysEqual([1, 2], [1, 2, 3])).toBe(false);
			expect(areArraysEqual([1, 2, 3], [1, 2])).toBe(false);
		});

		it("should return false for arrays with different elements", () => {
			expect(areArraysEqual([1, 2, 3], [1, 2, 4])).toBe(false);
			expect(areArraysEqual(["a", "b", "c"], ["a", "b", "d"])).toBe(false);
		});

		it("should return false for arrays with same elements in different order", () => {
			expect(areArraysEqual([1, 2, 3], [3, 2, 1])).toBe(false);
			expect(areArraysEqual(["a", "b", "c"], ["c", "b", "a"])).toBe(false);
		});

		it("should handle arrays with single element", () => {
			expect(areArraysEqual([1], [1])).toBe(true);
			expect(areArraysEqual([1], [2])).toBe(false);
		});

		it("should handle arrays with null and undefined", () => {
			expect(areArraysEqual([null], [null])).toBe(true);
			expect(areArraysEqual([undefined], [undefined])).toBe(true);
			expect(areArraysEqual([null], [undefined])).toBe(false);
		});

		it("should handle arrays with boolean values", () => {
			expect(areArraysEqual([true, false], [true, false])).toBe(true);
			expect(areArraysEqual([true, false], [false, true])).toBe(false);
		});

		it("should use strict equality (===) for comparison", () => {
			const obj1 = { id: 1 };
			const obj2 = { id: 1 };
			expect(areArraysEqual([obj1], [obj1])).toBe(true);
			expect(areArraysEqual([obj1], [obj2])).toBe(false);
		});

		it("should handle arrays with mixed types", () => {
			expect(areArraysEqual([1, "a", true], [1, "a", true])).toBe(true);
			expect(areArraysEqual([1, "a", true], [1, "a", false])).toBe(false);
		});

		it("should distinguish between 0 and -0", () => {
			expect(areArraysEqual([0], [-0])).toBe(true); // 0 === -0 is true
		});

		it("should not treat NaN as equal to NaN", () => {
			expect(areArraysEqual([Number.NaN], [Number.NaN])).toBe(false); // NaN !== NaN
		});
	});
});
