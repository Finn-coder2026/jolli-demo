import { areFiltersEqual, DEFAULT_SPACE_FILTERS, normalizeFilters, type SpaceFilters } from "./Space";
import { describe, expect, it } from "vitest";

describe("normalizeFilters", () => {
	it("should return default filters for undefined input", () => {
		expect(normalizeFilters(undefined)).toEqual(DEFAULT_SPACE_FILTERS);
	});

	it("should return default filters for null input", () => {
		expect(normalizeFilters(null)).toEqual(DEFAULT_SPACE_FILTERS);
	});

	it("should return default filters for empty object input", () => {
		expect(normalizeFilters({})).toEqual(DEFAULT_SPACE_FILTERS);
	});

	it("should preserve valid updated filter preset", () => {
		const result = normalizeFilters({ updated: "last_7_days" });
		expect(result).toEqual({ updated: "last_7_days", creator: "" });
	});

	it("should preserve valid custom date filter", () => {
		const result = normalizeFilters({ updated: { type: "after_date", date: "2025-01-01" } });
		expect(result).toEqual({ updated: { type: "after_date", date: "2025-01-01" }, creator: "" });
	});

	it("should preserve valid creator filter", () => {
		const result = normalizeFilters({ creator: "john" });
		expect(result).toEqual({ updated: "any_time", creator: "john" });
	});

	it("should preserve both filters when provided", () => {
		const result = normalizeFilters({ updated: "today", creator: "jane" });
		expect(result).toEqual({ updated: "today", creator: "jane" });
	});

	it("should return a new object (not a reference to DEFAULT_SPACE_FILTERS)", () => {
		const result = normalizeFilters(undefined);
		expect(result).not.toBe(DEFAULT_SPACE_FILTERS);
		expect(result).toEqual(DEFAULT_SPACE_FILTERS);
	});
});

describe("areFiltersEqual", () => {
	it("should return true for identical default filters", () => {
		expect(areFiltersEqual(DEFAULT_SPACE_FILTERS, DEFAULT_SPACE_FILTERS)).toBe(true);
	});

	it("should return true for equivalent filters with same preset", () => {
		const a: SpaceFilters = { updated: "last_7_days", creator: "john" };
		const b: SpaceFilters = { updated: "last_7_days", creator: "john" };
		expect(areFiltersEqual(a, b)).toBe(true);
	});

	it("should return true for equivalent custom date filters", () => {
		const a: SpaceFilters = { updated: { type: "after_date", date: "2025-01-01" }, creator: "" };
		const b: SpaceFilters = { updated: { type: "after_date", date: "2025-01-01" }, creator: "" };
		expect(areFiltersEqual(a, b)).toBe(true);
	});

	it("should return false for different updated presets", () => {
		const a: SpaceFilters = { updated: "today", creator: "" };
		const b: SpaceFilters = { updated: "last_7_days", creator: "" };
		expect(areFiltersEqual(a, b)).toBe(false);
	});

	it("should return false for different custom dates", () => {
		const a: SpaceFilters = { updated: { type: "after_date", date: "2025-01-01" }, creator: "" };
		const b: SpaceFilters = { updated: { type: "after_date", date: "2025-06-01" }, creator: "" };
		expect(areFiltersEqual(a, b)).toBe(false);
	});

	it("should return false when one is preset and other is custom date", () => {
		const a: SpaceFilters = { updated: "last_3_months", creator: "" };
		const b: SpaceFilters = { updated: { type: "after_date", date: "2025-01-01" }, creator: "" };
		expect(areFiltersEqual(a, b)).toBe(false);
	});

	it("should return false for different creators", () => {
		const a: SpaceFilters = { updated: "any_time", creator: "john" };
		const b: SpaceFilters = { updated: "any_time", creator: "jane" };
		expect(areFiltersEqual(a, b)).toBe(false);
	});
});
