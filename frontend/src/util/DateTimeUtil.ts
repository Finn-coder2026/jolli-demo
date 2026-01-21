import type { useIntlayer } from "react-intlayer";

/**
 * Type alias for the content returned by useIntlayer("date-time")
 * This is properly typed by intlayer's type generation system
 */
export type DateTimeContent = ReturnType<typeof useIntlayer<"date-time">>;

function formatMinutes(content: DateTimeContent, diffMins: number, format: "short" | "long"): string | undefined {
	if (diffMins < 1) {
		return format === "short" ? content.justNow.value : content.now.value;
	}
	if (diffMins < 2) {
		return format === "short" ? content.minutesAgo({ m: 1 }).value : content.aMinuteAgo.value;
	}
	if (diffMins < 5) {
		return format === "short" ? content.minutesAgo({ m: diffMins }).value : content.aFewMinutesAgo.value;
	}
	if (diffMins < 60) {
		return format === "short"
			? content.minutesAgo({ m: diffMins }).value
			: content.minutesAgoLong({ m: diffMins }).value;
	}
}

function formatHours(content: DateTimeContent, diffHours: number, format: "short" | "long"): string | undefined {
	if (diffHours === 1) {
		return format === "short" ? content.hoursAgo({ h: 1 }).value : content.oneHourAgo.value;
	}
	if (diffHours < 24) {
		return format === "short"
			? content.hoursAgo({ h: diffHours }).value
			: content.hoursAgoLong({ h: diffHours }).value;
	}
}

function formatDays(
	content: DateTimeContent,
	diffDays: number,
	diffMonths: number,
	format: "short" | "long",
): string | undefined {
	if (diffDays === 1) {
		return format === "short" ? content.daysAgo({ d: 1 }).value : content.oneDayAgo.value;
	}
	if (diffDays < 7) {
		return format === "short" ? content.daysAgo({ d: diffDays }).value : content.daysAgoLong({ d: diffDays }).value;
	}
	if (diffDays < 14) {
		return format === "short" ? content.daysAgo({ d: diffDays }).value : content.oneWeekAgo.value;
	}
	if (diffDays < 30) {
		const weeks = Math.floor(diffDays / 7);
		return format === "short" ? content.daysAgo({ d: diffDays }).value : content.weeksAgo({ w: weeks }).value;
	}
	if (diffMonths === 1) {
		return format === "short" ? content.daysAgo({ d: diffDays }).value : content.oneMonthAgo.value;
	}
	if (diffMonths < 12) {
		return format === "short" ? content.daysAgo({ d: diffDays }).value : content.monthsAgo({ m: diffMonths }).value;
	}
}

export function formatTimestamp(
	content: DateTimeContent,
	timestamp: string,
	format: "short" | "long" = "long",
): string {
	const date = new Date(timestamp);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / (60000 * 60));
	const diffDays = Math.floor(diffMs / (60000 * 60 * 24));
	const diffMonths = Math.floor(diffDays / 30);

	// Try formatting as minutes
	const minuteResult = formatMinutes(content, diffMins, format);
	if (minuteResult) {
		return minuteResult;
	}

	// Try formatting as hours
	const hourResult = formatHours(content, diffHours, format);
	if (hourResult) {
		return hourResult;
	}

	// Try formatting as days/weeks/months
	const dayResult = formatDays(content, diffDays, diffMonths, format);
	if (dayResult) {
		return dayResult;
	}

	// 12+ months - fall back to locale-specific date format
	return date.toLocaleDateString();
}
