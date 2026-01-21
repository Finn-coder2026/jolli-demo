import { getChangeTypeStyle, getStatusBadge, getVisibilityBadge } from "./SiteDetailUtils";
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

		it("should return null for unknown status", () => {
			const result = getStatusBadge("unknown", statusLabels);
			expect(result).toBeNull();
		});
	});

	describe("getVisibilityBadge", () => {
		const visibilityLabels = {
			internal: "Internal",
			external: "External",
		};

		it("should return badge element for internal visibility", () => {
			const result = getVisibilityBadge("internal", visibilityLabels);
			expect(result).not.toBeNull();
		});

		it("should return badge element for external visibility", () => {
			const result = getVisibilityBadge("external", visibilityLabels);
			expect(result).not.toBeNull();
		});

		it("should return null for unknown visibility", () => {
			const result = getVisibilityBadge("unknown", visibilityLabels);
			expect(result).toBeNull();
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
