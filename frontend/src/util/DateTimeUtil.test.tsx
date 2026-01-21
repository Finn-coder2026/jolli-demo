import { createMockIntlayerValue } from "../test/TestUtils";
import { formatTimestamp } from "./DateTimeUtil";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Helper to create a mock insert() function for testing
 * Returns an object with a .value property containing the interpolated string
 */
function createMockInsertFunction(template: string): (context: Record<string, unknown>) => { value: string } {
	return (context: Record<string, unknown>) => {
		const interpolated = template.replace(/\{\{(\w+)}}/g, (_, key) => {
			const value = context[key];
			return value !== undefined ? String(value) : `{{${key}}}`;
		});
		return { value: interpolated };
	};
}

describe("formatTimestamp", () => {
	const mockContent = {
		// Short format
		justNow: createMockIntlayerValue("Just now"),
		minutesAgo: createMockInsertFunction("{{m}} m ago"),
		hoursAgo: createMockInsertFunction("{{h}} h ago"),
		daysAgo: createMockInsertFunction("{{d}} d ago"),
		// Long format
		now: createMockIntlayerValue("now"),
		aMinuteAgo: createMockIntlayerValue("a minute ago"),
		aFewMinutesAgo: createMockIntlayerValue("a few minutes ago"),
		minutesAgoLong: createMockInsertFunction("{{m}} minutes ago"),
		oneHourAgo: createMockIntlayerValue("1 hour ago"),
		hoursAgoLong: createMockInsertFunction("{{h}} hours ago"),
		oneDayAgo: createMockIntlayerValue("1 day ago"),
		daysAgoLong: createMockInsertFunction("{{d}} days ago"),
		oneWeekAgo: createMockIntlayerValue("1 week ago"),
		weeksAgo: createMockInsertFunction("{{w}} weeks ago"),
		oneMonthAgo: createMockIntlayerValue("1 month ago"),
		monthsAgo: createMockInsertFunction("{{m}} months ago"),
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing - complex IntlayerNode types
	} as any;

	beforeEach(() => {
		vi.useRealTimers();
	});

	describe("short format", () => {
		it("should return 'Just now' for timestamps less than 1 minute ago", () => {
			const now = new Date();
			const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);

			const result = formatTimestamp(mockContent, thirtySecondsAgo.toISOString(), "short");
			expect(result).toBe("Just now");
		});

		it("should return 'Just now' for timestamps exactly now", () => {
			const now = new Date();

			const result = formatTimestamp(mockContent, now.toISOString(), "short");
			expect(result).toBe("Just now");
		});

		it("should return '1 m ago' for timestamps 1-2 minutes ago", () => {
			const now = new Date();
			const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

			const result = formatTimestamp(mockContent, oneMinuteAgo.toISOString(), "short");
			expect(result).toBe("1 m ago");
		});

		it("should return 'X m ago' for timestamps 2-5 minutes ago", () => {
			const now = new Date();
			const threeMinutesAgo = new Date(now.getTime() - 3 * 60 * 1000);

			const result = formatTimestamp(mockContent, threeMinutesAgo.toISOString(), "short");
			expect(result).toBe("3 m ago");
		});

		it("should return 'X m ago' for timestamps 5-59 minutes ago", () => {
			const now = new Date();
			const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

			const result = formatTimestamp(mockContent, fiveMinutesAgo.toISOString(), "short");
			expect(result).toBe("5 m ago");
		});

		it("should return '59 m ago' for timestamps 59 minutes ago", () => {
			const now = new Date();
			const fiftyNineMinutesAgo = new Date(now.getTime() - 59 * 60 * 1000);

			const result = formatTimestamp(mockContent, fiftyNineMinutesAgo.toISOString(), "short");
			expect(result).toBe("59 m ago");
		});

		it("should return '1 h ago' for timestamps exactly 1 hour ago", () => {
			const now = new Date();
			const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

			const result = formatTimestamp(mockContent, oneHourAgo.toISOString(), "short");
			expect(result).toBe("1 h ago");
		});

		it("should return 'X h ago' for timestamps 2-23 hours ago", () => {
			const now = new Date();
			const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

			const result = formatTimestamp(mockContent, threeHoursAgo.toISOString(), "short");
			expect(result).toBe("3 h ago");
		});

		it("should return '23 h ago' for timestamps 23 hours ago", () => {
			const now = new Date();
			const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);

			const result = formatTimestamp(mockContent, twentyThreeHoursAgo.toISOString(), "short");
			expect(result).toBe("23 h ago");
		});

		it("should return '1 d ago' for timestamps exactly 24 hours ago", () => {
			const now = new Date();
			const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

			const result = formatTimestamp(mockContent, oneDayAgo.toISOString(), "short");
			expect(result).toBe("1 d ago");
		});

		it("should return 'X d ago' for timestamps 2-6 days ago", () => {
			const now = new Date();
			const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

			const result = formatTimestamp(mockContent, twoDaysAgo.toISOString(), "short");
			expect(result).toBe("2 d ago");
		});

		it("should return 'X d ago' for timestamps 7-29 days ago", () => {
			const now = new Date();
			const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

			expect(formatTimestamp(mockContent, sevenDaysAgo.toISOString(), "short")).toBe("7 d ago");
			expect(formatTimestamp(mockContent, fourteenDaysAgo.toISOString(), "short")).toBe("14 d ago");
		});

		it("should return 'X d ago' for timestamps 30+ days ago", () => {
			const now = new Date();
			const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

			const result = formatTimestamp(mockContent, thirtyDaysAgo.toISOString(), "short");
			expect(result).toBe("30 d ago");
		});

		it("should return 'X d ago' for timestamps 2-11 months ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);
			const twoMonthsAgo = new Date("2025-08-07T12:00:00Z");
			const sixMonthsAgo = new Date("2025-04-07T12:00:00Z");

			const diffDays2 = Math.floor((now.getTime() - twoMonthsAgo.getTime()) / (1000 * 60 * 60 * 24));
			const diffDays6 = Math.floor((now.getTime() - sixMonthsAgo.getTime()) / (1000 * 60 * 60 * 24));

			expect(formatTimestamp(mockContent, twoMonthsAgo.toISOString(), "short")).toBe(`${diffDays2} d ago`);
			expect(formatTimestamp(mockContent, sixMonthsAgo.toISOString(), "short")).toBe(`${diffDays6} d ago`);
		});

		it("should return formatted date for timestamps 12+ months ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);
			const oneYearAgo = "2024-10-07T12:00:00Z";

			const result = formatTimestamp(mockContent, oneYearAgo, "short");
			expect(result).toBe(new Date(oneYearAgo).toLocaleDateString());
		});
	});

	describe("long format (default)", () => {
		it("should return 'now' for timestamps less than 1 minute ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-07T11:59:30Z")).toBe("now");
			expect(formatTimestamp(mockContent, "2025-10-07T11:59:45Z", "long")).toBe("now");
		});

		it("should return 'a minute ago' for 1-2 minutes ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-07T11:59:00Z")).toBe("a minute ago");
			expect(formatTimestamp(mockContent, "2025-10-07T11:58:30Z", "long")).toBe("a minute ago");
		});

		it("should return 'a few minutes ago' for 2-5 minutes ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-07T11:58:00Z")).toBe("a few minutes ago");
			expect(formatTimestamp(mockContent, "2025-10-07T11:57:00Z")).toBe("a few minutes ago");
			expect(formatTimestamp(mockContent, "2025-10-07T11:56:00Z")).toBe("a few minutes ago");
		});

		it("should return 'X minutes ago' for 5-59 minutes ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-07T11:55:00Z")).toBe("5 minutes ago");
			expect(formatTimestamp(mockContent, "2025-10-07T11:30:00Z")).toBe("30 minutes ago");
			expect(formatTimestamp(mockContent, "2025-10-07T11:01:00Z")).toBe("59 minutes ago");
		});

		it("should return '1 hour ago' for exactly 1 hour ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-07T11:00:00Z")).toBe("1 hour ago");
		});

		it("should return 'X hours ago' for 2-23 hours ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-07T10:00:00Z")).toBe("2 hours ago");
			expect(formatTimestamp(mockContent, "2025-10-07T06:00:00Z")).toBe("6 hours ago");
			expect(formatTimestamp(mockContent, "2025-10-06T13:00:00Z")).toBe("23 hours ago");
		});

		it("should return '1 day ago' for yesterday", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-06T12:00:00Z")).toBe("1 day ago");
		});

		it("should return 'X days ago' for 2-6 days ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-10-05T12:00:00Z")).toBe("2 days ago");
			expect(formatTimestamp(mockContent, "2025-10-04T12:00:00Z")).toBe("3 days ago");
			expect(formatTimestamp(mockContent, "2025-10-02T12:00:00Z")).toBe("5 days ago");
			expect(formatTimestamp(mockContent, "2025-10-01T12:00:00Z")).toBe("6 days ago");
		});

		it("should return '1 week ago' for 7-13 days ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-09-30T12:00:00Z")).toBe("1 week ago");
			expect(formatTimestamp(mockContent, "2025-09-27T12:00:00Z")).toBe("1 week ago");
			expect(formatTimestamp(mockContent, "2025-09-24T12:00:00Z")).toBe("1 week ago");
		});

		it("should return 'X weeks ago' for 14-29 days ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-09-23T12:00:00Z")).toBe("2 weeks ago");
			expect(formatTimestamp(mockContent, "2025-09-16T12:00:00Z")).toBe("3 weeks ago");
			expect(formatTimestamp(mockContent, "2025-09-09T12:00:00Z")).toBe("4 weeks ago");
		});

		it("should return '1 month ago' for 30-59 days ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-09-07T12:00:00Z")).toBe("1 month ago");
			expect(formatTimestamp(mockContent, "2025-08-20T12:00:00Z")).toBe("1 month ago");
		});

		it("should return 'X months ago' for 2-11 months ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			expect(formatTimestamp(mockContent, "2025-08-07T12:00:00Z")).toBe("2 months ago");
			expect(formatTimestamp(mockContent, "2025-04-07T12:00:00Z")).toBe("6 months ago");
			expect(formatTimestamp(mockContent, "2024-11-07T12:00:00Z")).toBe("11 months ago");
		});

		it("should return formatted date for timestamps 12+ months ago", () => {
			const now = new Date("2025-10-07T12:00:00Z");
			vi.setSystemTime(now);

			const oneYearAgo = "2024-10-07T12:00:00Z";
			const twoYearsAgo = "2023-10-07T12:00:00Z";

			expect(formatTimestamp(mockContent, oneYearAgo)).toBe(new Date(oneYearAgo).toLocaleDateString());
			expect(formatTimestamp(mockContent, twoYearsAgo)).toBe(new Date(twoYearsAgo).toLocaleDateString());
		});
	});

	describe("edge cases", () => {
		it("should handle timestamps at exact boundaries", () => {
			const now = new Date();
			const exactlyFiveMinutes = new Date(now.getTime() - 5 * 60 * 1000);
			const exactlyTwoHours = new Date(now.getTime() - 2 * 60 * 60 * 1000);
			const exactlyThreeDays = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

			expect(formatTimestamp(mockContent, exactlyFiveMinutes.toISOString(), "short")).toBe("5 m ago");
			expect(formatTimestamp(mockContent, exactlyTwoHours.toISOString(), "short")).toBe("2 h ago");
			expect(formatTimestamp(mockContent, exactlyThreeDays.toISOString(), "short")).toBe("3 d ago");
		});

		it("should floor partial time units", () => {
			const now = new Date();
			const fiveMinutesThirtySeconds = new Date(now.getTime() - (5 * 60 + 30) * 1000);
			const threeHoursFortyFiveMinutes = new Date(now.getTime() - (3 * 60 + 45) * 60 * 1000);
			const twoDaysTwelveHours = new Date(now.getTime() - (2 * 24 + 12) * 60 * 60 * 1000);

			expect(formatTimestamp(mockContent, fiveMinutesThirtySeconds.toISOString(), "short")).toBe("5 m ago");
			expect(formatTimestamp(mockContent, threeHoursFortyFiveMinutes.toISOString(), "short")).toBe("3 h ago");
			expect(formatTimestamp(mockContent, twoDaysTwelveHours.toISOString(), "short")).toBe("2 d ago");
		});
	});
});
