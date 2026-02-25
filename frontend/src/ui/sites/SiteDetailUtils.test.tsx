import { getChangeCount, getChangeTypeStyle, getStatusBadge, needsRebuild } from "./SiteDetailUtils";
import type { SiteWithUpdate } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

// Mock lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Pencil: () => <div data-testid="pencil-icon" />,
		Plus: () => <div data-testid="plus-icon" />,
		Trash2: () => <div data-testid="trash2-icon" />,
	};
});

describe("SiteDetailUtils", () => {
	describe("getStatusBadge", () => {
		const statusLabels = {
			active: "Active",
			building: "Building",
			pending: "Pending",
			error: "Error",
		};

		it("should return badge element for active status", () => {
			const result = getStatusBadge("active", statusLabels);
			expect(result).not.toBeNull();
		});

		it("should return badge element for building status", () => {
			const result = getStatusBadge("building", statusLabels);
			expect(result).not.toBeNull();
		});

		it("should return badge element for pending status", () => {
			const result = getStatusBadge("pending", statusLabels);
			expect(result).not.toBeNull();
		});

		it("should return badge element for error status", () => {
			const result = getStatusBadge("error", statusLabels);
			expect(result).not.toBeNull();
		});

		it("should return null for archived status", () => {
			const result = getStatusBadge("archived", statusLabels);
			expect(result).toBeNull();
		});
	});

	describe("getChangeCount", () => {
		function makeSite(overrides: Partial<SiteWithUpdate> = {}): SiteWithUpdate {
			return {
				id: 1,
				name: "test",
				displayName: "Test",
				userId: 1,
				visibility: "external",
				needsUpdate: false,
				...overrides,
			} as SiteWithUpdate;
		}

		it("should return 0 when no changes exist", () => {
			expect(getChangeCount(makeSite())).toBe(0);
		});

		it("should count changed articles", () => {
			const site = makeSite({
				changedArticles: [
					{ id: 1, jrn: "a", title: "A", changeType: "new", updatedAt: "2024-01-01", contentType: "mdx" },
				],
			});
			expect(getChangeCount(site)).toBe(1);
		});

		it("should count all change types together", () => {
			const site = makeSite({
				changedArticles: [
					{ id: 1, jrn: "a", title: "A", changeType: "new", updatedAt: "2024-01-01", contentType: "mdx" },
				],
				changedConfigFiles: [{ path: "_meta.ts", displayName: "Meta" }],
				authChange: { from: false, to: true },
				brandingChanged: true,
			});
			expect(getChangeCount(site)).toBe(4);
		});
	});

	describe("needsRebuild", () => {
		function makeSite(overrides: Partial<SiteWithUpdate> = {}): SiteWithUpdate {
			return {
				id: 1,
				name: "test",
				displayName: "Test",
				userId: 1,
				visibility: "external",
				needsUpdate: false,
				...overrides,
			} as SiteWithUpdate;
		}

		it("should return false when no changes", () => {
			expect(needsRebuild(makeSite())).toBe(false);
		});

		it("should return true when needsUpdate is true", () => {
			expect(needsRebuild(makeSite({ needsUpdate: true }))).toBe(true);
		});

		it("should return true when authChange exists", () => {
			expect(needsRebuild(makeSite({ authChange: { from: false, to: true } }))).toBe(true);
		});

		it("should return true when brandingChanged is true", () => {
			expect(needsRebuild(makeSite({ brandingChanged: true }))).toBe(true);
		});

		it("should return true when changedConfigFiles is non-empty", () => {
			expect(needsRebuild(makeSite({ changedConfigFiles: [{ path: "_meta.ts", displayName: "Meta" }] }))).toBe(
				true,
			);
		});
	});

	describe("getChangeTypeStyle", () => {
		it("should return green style for new change type", () => {
			const result = getChangeTypeStyle("new");
			expect(result.bgClass).toContain("green");
			expect(result.textClass).toContain("green");
		});

		it("should return red style for deleted change type", () => {
			const result = getChangeTypeStyle("deleted");
			expect(result.bgClass).toContain("red");
			expect(result.textClass).toContain("red");
		});

		it("should return amber style for updated change type", () => {
			const result = getChangeTypeStyle("updated");
			expect(result.bgClass).toContain("amber");
			expect(result.textClass).toContain("amber");
		});

		it("should return amber style for undefined change type", () => {
			const result = getChangeTypeStyle(undefined);
			expect(result.bgClass).toContain("amber");
			expect(result.textClass).toContain("amber");
		});
	});
});
