import { AppTabs } from "./AppTabs";
import { describe, expect, it } from "vitest";

describe("AppTabs", () => {
	it("should be defined", () => {
		expect(AppTabs).toBeDefined();
	});

	it("should accept tabs prop", () => {
		const tabs = [
			{ key: "tab1", label: "Tab 1", children: <div>Content 1</div> },
			{ key: "tab2", label: "Tab 2", children: <div>Content 2</div> },
		];

		// Just verify the component accepts the props
		expect(() => AppTabs({ tabs })).not.toThrow();
	});

	it("should accept defaultActiveKey prop", () => {
		const tabs = [
			{ key: "tab1", label: "Tab 1", children: <div>Content 1</div> },
			{ key: "tab2", label: "Tab 2", children: <div>Content 2</div> },
		];

		// Verify it accepts defaultActiveKey
		expect(() => AppTabs({ tabs, defaultActiveKey: "tab2" })).not.toThrow();
	});

	it("should handle empty tabs", () => {
		const tabs: Array<{ key: string; label: string; children: React.ReactElement }> = [];

		// Verify it handles empty array
		expect(() => AppTabs({ tabs })).not.toThrow();
	});
});
