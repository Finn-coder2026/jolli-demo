import { createDynamicPreference, definePreference, Serializers } from "./PreferencesTypes";
import { describe, expect, it } from "vitest";

describe("PreferencesTypes", () => {
	describe("Serializers", () => {
		describe("string", () => {
			it("should serialize a string", () => {
				expect(Serializers.string.serialize("hello")).toBe("hello");
			});

			it("should deserialize a string", () => {
				expect(Serializers.string.deserialize("hello")).toBe("hello");
			});
		});

		describe("boolean", () => {
			it("should serialize true", () => {
				expect(Serializers.boolean.serialize(true)).toBe("true");
			});

			it("should serialize false", () => {
				expect(Serializers.boolean.serialize(false)).toBe("false");
			});

			it("should deserialize 'true' to true", () => {
				expect(Serializers.boolean.deserialize("true")).toBe(true);
			});

			it("should deserialize 'false' to false", () => {
				expect(Serializers.boolean.deserialize("false")).toBe(false);
			});

			it("should deserialize any non-'true' string to false", () => {
				expect(Serializers.boolean.deserialize("yes")).toBe(false);
				expect(Serializers.boolean.deserialize("1")).toBe(false);
				expect(Serializers.boolean.deserialize("")).toBe(false);
			});
		});

		describe("number", () => {
			it("should serialize a number", () => {
				expect(Serializers.number.serialize(42)).toBe("42");
				expect(Serializers.number.serialize(3.14)).toBe("3.14");
			});

			it("should deserialize a number string", () => {
				expect(Serializers.number.deserialize("42")).toBe(42);
				expect(Serializers.number.deserialize("3.14")).toBe(3.14);
			});
		});

		describe("nullableString", () => {
			it("should serialize a string", () => {
				expect(Serializers.nullableString.serialize("hello")).toBe("hello");
			});

			it("should serialize null as empty string", () => {
				expect(Serializers.nullableString.serialize(null)).toBe("");
			});

			it("should deserialize a non-empty string", () => {
				expect(Serializers.nullableString.deserialize("hello")).toBe("hello");
			});

			it("should deserialize empty string as null", () => {
				expect(Serializers.nullableString.deserialize("")).toBe(null);
			});
		});

		describe("nullableNumber", () => {
			it("should serialize a number", () => {
				expect(Serializers.nullableNumber.serialize(42)).toBe("42");
			});

			it("should serialize null as empty string", () => {
				expect(Serializers.nullableNumber.serialize(null)).toBe("");
			});

			it("should deserialize a number string", () => {
				expect(Serializers.nullableNumber.deserialize("42")).toBe(42);
			});

			it("should deserialize empty string as null", () => {
				expect(Serializers.nullableNumber.deserialize("")).toBe(null);
			});
		});

		describe("numberArray", () => {
			it("should serialize an array of numbers", () => {
				expect(Serializers.numberArray.serialize([1, 2, 3])).toBe("[1,2,3]");
			});

			it("should serialize an empty array", () => {
				expect(Serializers.numberArray.serialize([])).toBe("[]");
			});

			it("should deserialize a valid JSON array", () => {
				expect(Serializers.numberArray.deserialize("[1,2,3]")).toEqual([1, 2, 3]);
			});

			it("should deserialize an empty JSON array", () => {
				expect(Serializers.numberArray.deserialize("[]")).toEqual([]);
			});

			it("should return empty array for invalid JSON", () => {
				expect(Serializers.numberArray.deserialize("invalid")).toEqual([]);
			});

			it("should return empty array for non-array JSON", () => {
				expect(Serializers.numberArray.deserialize('{"a":1}')).toEqual([]);
				expect(Serializers.numberArray.deserialize('"string"')).toEqual([]);
				expect(Serializers.numberArray.deserialize("42")).toEqual([]);
			});
		});
	});

	describe("definePreference", () => {
		it("should return the preference definition unchanged", () => {
			const definition = {
				key: "testKey",
				scope: "global" as const,
				defaultValue: "default",
				serialize: Serializers.string.serialize,
				deserialize: Serializers.string.deserialize,
			};

			const result = definePreference(definition);

			expect(result).toBe(definition);
		});

		it("should work with optional validate function", () => {
			const definition = {
				key: "testKey",
				scope: "tenant" as const,
				defaultValue: 10,
				serialize: Serializers.number.serialize,
				deserialize: Serializers.number.deserialize,
				validate: (value: number) => value > 0,
			};

			const result = definePreference(definition);

			expect(result).toBe(definition);
			expect(result.validate?.(5)).toBe(true);
			expect(result.validate?.(-1)).toBe(false);
		});
	});

	describe("createDynamicPreference", () => {
		it("should create a factory that returns preference definitions", () => {
			const panelWidth = createDynamicPreference((panelId: string) => ({
				key: `panels:${panelId}`,
				scope: "tenant" as const,
				defaultValue: 50,
				serialize: Serializers.number.serialize,
				deserialize: Serializers.number.deserialize,
			}));

			const leftPanel = panelWidth("leftPanel");
			const rightPanel = panelWidth("rightPanel");

			expect(leftPanel.key).toBe("panels:leftPanel");
			expect(rightPanel.key).toBe("panels:rightPanel");
			expect(leftPanel.defaultValue).toBe(50);
		});

		it("should support multiple arguments", () => {
			const cellValue = createDynamicPreference((row: number, col: number) => ({
				key: `cell:${row}:${col}`,
				scope: "tenant-org" as const,
				defaultValue: "",
				serialize: Serializers.string.serialize,
				deserialize: Serializers.string.deserialize,
			}));

			const cell = cellValue(1, 2);

			expect(cell.key).toBe("cell:1:2");
			expect(cell.scope).toBe("tenant-org");
		});
	});
});
