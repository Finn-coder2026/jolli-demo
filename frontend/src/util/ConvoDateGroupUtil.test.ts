import { type DateGroupLabels, groupConvosByDate } from "./ConvoDateGroupUtil";
import type { AgentHubConvoSummary } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

const labels: DateGroupLabels = {
	today: "Today",
	yesterday: "Yesterday",
	thisWeek: "This Week",
	thisMonth: "This Month",
	older: "Older",
};

function makeConvo(id: number, updatedAt: string, title?: string): AgentHubConvoSummary {
	return { id, title, convoKind: undefined, updatedAt };
}

describe("ConvoDateGroupUtil", () => {
	beforeEach(() => {
		// Fix "now" to 2026-02-11T12:00:00Z
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-02-11T12:00:00Z"));
	});

	it("should group a conversation from today", () => {
		const convos = [makeConvo(1, "2026-02-11T10:00:00Z", "Today's chat")];
		const result = groupConvosByDate(convos, labels);

		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("Today");
		expect(result[0].convos).toHaveLength(1);
		expect(result[0].convos[0].title).toBe("Today's chat");
	});

	it("should group a conversation from yesterday", () => {
		const convos = [makeConvo(1, "2026-02-10T15:00:00Z", "Yesterday's chat")];
		const result = groupConvosByDate(convos, labels);

		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("Yesterday");
	});

	it("should group a conversation from this week", () => {
		const convos = [makeConvo(1, "2026-02-07T10:00:00Z", "This week")];
		const result = groupConvosByDate(convos, labels);

		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("This Week");
	});

	it("should group a conversation from this month", () => {
		const convos = [makeConvo(1, "2026-01-20T10:00:00Z", "This month")];
		const result = groupConvosByDate(convos, labels);

		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("This Month");
	});

	it("should group an old conversation", () => {
		const convos = [makeConvo(1, "2025-06-01T10:00:00Z", "Old chat")];
		const result = groupConvosByDate(convos, labels);

		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("Older");
	});

	it("should group multiple conversations into different date groups", () => {
		const convos = [
			makeConvo(1, "2026-02-11T10:00:00Z", "Today 1"),
			makeConvo(2, "2026-02-11T08:00:00Z", "Today 2"),
			makeConvo(3, "2026-02-10T15:00:00Z", "Yesterday"),
			makeConvo(4, "2026-02-05T10:00:00Z", "This week"),
			makeConvo(5, "2025-01-01T10:00:00Z", "Older"),
		];

		const result = groupConvosByDate(convos, labels);

		expect(result).toHaveLength(4);
		expect(result[0].label).toBe("Today");
		expect(result[0].convos).toHaveLength(2);
		expect(result[1].label).toBe("Yesterday");
		expect(result[1].convos).toHaveLength(1);
		expect(result[2].label).toBe("This Week");
		expect(result[2].convos).toHaveLength(1);
		expect(result[3].label).toBe("Older");
		expect(result[3].convos).toHaveLength(1);
	});

	it("should return empty array for no conversations", () => {
		const result = groupConvosByDate([], labels);
		expect(result).toHaveLength(0);
	});

	it("should maintain order of groups (today, yesterday, this week, this month, older)", () => {
		const convos = [
			makeConvo(1, "2025-01-01T10:00:00Z", "Older"),
			makeConvo(2, "2026-02-11T10:00:00Z", "Today"),
			makeConvo(3, "2026-01-20T10:00:00Z", "This month"),
		];

		const result = groupConvosByDate(convos, labels);
		const groupLabels = result.map(g => g.label);

		expect(groupLabels).toEqual(["Today", "This Month", "Older"]);
	});

	it("should handle conversations with undefined titles", () => {
		const convos = [makeConvo(1, "2026-02-11T10:00:00Z")];
		const result = groupConvosByDate(convos, labels);

		expect(result[0].convos[0].title).toBeUndefined();
	});
});
