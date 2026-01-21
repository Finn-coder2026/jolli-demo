/**
 * @vitest-environment jsdom
 */
import { getView, VIEWS } from "./index";
import { describe, expect, it } from "vitest";

describe("View Registry", () => {
	describe("VIEWS array", () => {
		it("should export all views", () => {
			expect(VIEWS).toHaveLength(3);

			const viewNames = VIEWS.map(view => view.name);
			expect(viewNames).toContain("admin");
			expect(viewNames).toContain("chat");
			expect(viewNames).toContain("conversations");
		});

		it("should have all views with proper structure", () => {
			for (const view of VIEWS) {
				expect(view).toHaveProperty("name");
				expect(view).toHaveProperty("component");
				expect(typeof view.name).toBe("string");
				expect(typeof view.component).toBe("function");
			}
		});
	});

	describe("getView", () => {
		it("should return chat view by name", () => {
			const view = getView("chat");

			expect(view).toBeDefined();
			expect(view?.name).toBe("chat");
			expect(typeof view?.component).toBe("function");
		});

		it("should return convos view by name", () => {
			const view = getView("conversations");

			expect(view).toBeDefined();
			expect(view?.name).toBe("conversations");
			expect(typeof view?.component).toBe("function");
		});

		it("should return undefined for unknown view name", () => {
			const view = getView("unknown");

			expect(view).toBeUndefined();
		});

		it("should return undefined for empty string", () => {
			const view = getView("");

			expect(view).toBeUndefined();
		});

		it("should be case-sensitive", () => {
			const view = getView("CHAT");

			expect(view).toBeUndefined();
		});
	});
});
