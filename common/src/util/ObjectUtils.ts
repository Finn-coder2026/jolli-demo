/**
 * A Type that specifies that certain fields that are normally readonly on a base type are mutable.
 */
export type MutableFields<T, K extends keyof T> = Omit<T, K> & {
	-readonly [P in K]: T[P];
};

/**
 * Excludes an array of fields from the given object.
 *
 * @param obj the object to exclude the fields from.
 * @param keysToExclude the keys to exclude.
 */
export function excludeFields<T extends object, K extends keyof T>(obj: T, keysToExclude: Array<K>): Omit<T, K> {
	const newObj = { ...obj };
	for (const key of keysToExclude) {
		delete newObj[key];
	}
	return newObj as Omit<T, K>;
}

/**
 * A function for memoizing the creation of an object.
 *
 * @param F the function to create the object that will be memoized with.
 */
export function memoized<T>(F: () => T): () => T {
	const m = F();
	return () => m;
}

/**
 * A function for determining if a value is a primitive number.
 * @param value the value to check.
 */
export function isPrimitiveNumber(value: unknown): value is number {
	return typeof value === "number";
}

/**
 * Determines if two arrays are equal.
 * @param arr1 the first array.
 * @param arr2 the second array.
 */
export function areArraysEqual<T>(arr1: Array<T>, arr2: Array<T>): boolean {
	if (arr1.length !== arr2.length) {
		return false;
	}
	for (let i = 0; i < arr1.length; i++) {
		if (arr1[i] !== arr2[i]) {
			return false;
		}
	}
	return true;
}
