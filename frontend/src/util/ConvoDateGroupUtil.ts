import type { AgentHubConvoSummary } from "jolli-common";

/**
 * Date group labels used by the conversation sidebar
 */
export interface DateGroupLabels {
	readonly today: string;
	readonly yesterday: string;
	readonly thisWeek: string;
	readonly thisMonth: string;
	readonly older: string;
}

/**
 * A group of conversations under a date heading
 */
export interface ConvoDateGroup {
	readonly label: string;
	readonly convos: ReadonlyArray<AgentHubConvoSummary>;
}

/**
 * Groups conversations by date relative to today.
 * Conversations within each group are sorted newest-first.
 */
export function groupConvosByDate(
	convos: ReadonlyArray<AgentHubConvoSummary>,
	labels: DateGroupLabels,
): ReadonlyArray<ConvoDateGroup> {
	const now = new Date();
	const todayStart = startOfDay(now);
	const yesterdayStart = addDays(todayStart, -1);
	const weekStart = addDays(todayStart, -7);
	const monthStart = addDays(todayStart, -30);

	const groups: Record<string, Array<AgentHubConvoSummary>> = {};

	for (const convo of convos) {
		const date = new Date(convo.updatedAt);
		const label = getDateLabel(date, todayStart, yesterdayStart, weekStart, monthStart, labels);

		if (!groups[label]) {
			groups[label] = [];
		}
		groups[label].push(convo);
	}

	// Return groups in chronological order (most recent first)
	const orderedLabels = [labels.today, labels.yesterday, labels.thisWeek, labels.thisMonth, labels.older];
	const result: Array<ConvoDateGroup> = [];

	for (const label of orderedLabels) {
		if (groups[label]?.length) {
			result.push({ label, convos: groups[label] });
		}
	}

	return result;
}

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function getDateLabel(
	date: Date,
	todayStart: Date,
	yesterdayStart: Date,
	weekStart: Date,
	monthStart: Date,
	labels: DateGroupLabels,
): string {
	if (date >= todayStart) {
		return labels.today;
	}
	if (date >= yesterdayStart) {
		return labels.yesterday;
	}
	if (date >= weekStart) {
		return labels.thisWeek;
	}
	if (date >= monthStart) {
		return labels.thisMonth;
	}
	return labels.older;
}
