/**
 * A type that represents all valid JSON values.
 */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

/**
 * An object whose keys are strings and values are JsonValues.
 */
export interface JsonObject {
	[key: string]: JsonValue;
}

/**
 *  An array containing JsonValues.
 */
export interface JsonArray extends Array<JsonValue> {}

// Type predicates
const isObject = (val: unknown): val is JsonObject => typeof val === "object" && val !== null && !Array.isArray(val);

const isArray = (val: unknown): val is JsonArray => Array.isArray(val);

/**
 * Compare two JSON values to determine whether they are deeply equal (irrespective of field order).
 * @param a the first JSON value.
 * @param b the second JSON value
 */
export function jsonDeepEquals(a: JsonValue, b: JsonValue): boolean {
	if (a === b) {
		return true;
	}

	if (isObject(a) && isObject(b)) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) {
			return false;
		}
		for (const key of keysA) {
			if (!jsonDeepEquals(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}

	if (isArray(a) && isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!jsonDeepEquals(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}

	return false;
}
