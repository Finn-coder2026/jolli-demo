import { SectionChangePanel } from "./SectionChangePanel";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import type { DocDraftSectionChanges } from "jolli-common";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SectionChangePanel", () => {
	const mockOnApply = vi.fn();
	const mockOnDismiss = vi.fn();
	const mockOnClose = vi.fn();

	const singleChange: Array<DocDraftSectionChanges> = [
		{
			id: 1,
			draftId: 100,
			path: "section-1",
			changeType: "update",
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: "Update the section content",
					value: "New content",
					appliedAt: undefined,
				},
			],
			comments: [],
			applied: false,
			dismissed: false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	];

	const multipleChanges: Array<DocDraftSectionChanges> = [
		{
			id: 1,
			draftId: 100,
			path: "section-1",
			changeType: "update",
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: "First update",
					value: "New content 1",
					appliedAt: undefined,
				},
			],
			comments: [],
			applied: false,
			dismissed: false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
		{
			id: 2,
			draftId: 100,
			path: "section-2",
			changeType: "delete",
			proposed: [
				{
					for: "content",
					who: { type: "agent" },
					description: "Delete this section",
					value: "",
					appliedAt: undefined,
				},
			],
			comments: [],
			applied: false,
			dismissed: false,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders panel with single change", () => {
		const { getByTestId, getByText } = render(
			<SectionChangePanel
				changes={singleChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		expect(getByTestId("section-change-panel")).toBeTruthy();
		expect(getByText("Agent Suggestion")).toBeTruthy();
		expect(getByText("Update the section content")).toBeTruthy();
		expect(getByTestId("apply-button")).toBeTruthy();
		expect(getByTestId("dismiss-button")).toBeTruthy();
	});

	it("calls onApply when apply button is clicked", () => {
		const { getByTestId } = render(
			<SectionChangePanel
				changes={singleChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		fireEvent.click(getByTestId("apply-button"));
		expect(mockOnApply).toHaveBeenCalledWith(1);
	});

	it("calls onDismiss when dismiss button is clicked", () => {
		const { getByTestId } = render(
			<SectionChangePanel
				changes={singleChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		fireEvent.click(getByTestId("dismiss-button"));
		expect(mockOnDismiss).toHaveBeenCalledWith(1);
	});

	it("calls onClose when close button is clicked", () => {
		const { getByTestId } = render(
			<SectionChangePanel
				changes={singleChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		fireEvent.click(getByTestId("close-button"));
		expect(mockOnClose).toHaveBeenCalled();
	});

	it("calls onClose when Escape key is pressed", async () => {
		render(
			<SectionChangePanel
				changes={singleChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => {
			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	it("renders tabs for multiple changes", () => {
		const { getByTestId } = render(
			<SectionChangePanel
				changes={multipleChanges}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		expect(getByTestId("change-tab-0")).toBeTruthy();
		expect(getByTestId("change-tab-1")).toBeTruthy();
	});

	it("shows correct change type labels", () => {
		const { getByTestId } = render(
			<SectionChangePanel
				changes={multipleChanges}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		expect(getByTestId("change-tab-0").textContent).toContain("Update");
		expect(getByTestId("change-tab-1").textContent).toContain("Delete");
	});

	it("handles insert-after change type", () => {
		const insertAfterChange: Array<DocDraftSectionChanges> = [
			{
				id: 1,
				draftId: 100,
				path: "section-1",
				changeType: "insert-after",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Insert after section",
						value: "New content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: 2,
				draftId: 100,
				path: "section-2",
				changeType: "insert-before",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Insert before section",
						value: "New content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const { getByTestId } = render(
			<SectionChangePanel
				changes={insertAfterChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		expect(getByTestId("change-tab-0").textContent).toContain("Insert After");
		expect(getByTestId("change-tab-1").textContent).toContain("Insert Before");
	});

	it("handles unknown change type", () => {
		const unknownChange: Array<DocDraftSectionChanges> = [
			{
				id: 1,
				draftId: 100,
				path: "section-1",
				changeType: "unknown" as "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Unknown type",
						value: "New content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: 2,
				draftId: 100,
				path: "section-2",
				changeType: "other" as "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Other type",
						value: "Content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const { getByTestId } = render(
			<SectionChangePanel
				changes={unknownChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		expect(getByTestId("change-tab-0").textContent).toContain("Change");
	});

	it("shows 'No description available' when proposed has no description", () => {
		const noDescChange: Array<DocDraftSectionChanges> = [
			{
				id: 1,
				draftId: 100,
				path: "section-1",
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "",
						value: "New content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const { getByText } = render(
			<SectionChangePanel
				changes={noDescChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		expect(getByText("No description available")).toBeTruthy();
	});

	it("applies custom className", () => {
		const { getByTestId } = render(
			<SectionChangePanel
				changes={singleChange}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
				className="custom-class"
			/>,
		);

		expect(getByTestId("section-change-panel").className).toContain("custom-class");
	});

	it("switches tabs and calls onApply for different change", () => {
		const { getByTestId, getAllByTestId } = render(
			<SectionChangePanel
				changes={multipleChanges}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		// Click the second tab
		fireEvent.click(getByTestId("change-tab-1"));

		// Click apply on the second tab's apply button
		const applyButtons = getAllByTestId("apply-button");
		fireEvent.click(applyButtons[1]);

		expect(mockOnApply).toHaveBeenCalledWith(2);
	});

	it("handles empty changes array with fallback tab value", () => {
		const emptyChanges: Array<DocDraftSectionChanges> = [];

		const { getByTestId } = render(
			<SectionChangePanel
				changes={emptyChanges}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		// Should render without crashing, using "0" as fallback tab value
		expect(getByTestId("section-change-panel")).toBeTruthy();
	});

	it("shows 'No description available' in tabbed view when proposed has empty description", () => {
		const tabChangesWithNoDesc: Array<DocDraftSectionChanges> = [
			{
				id: 1,
				draftId: 100,
				path: "section-1",
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "Has description",
						value: "New content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
			{
				id: 2,
				draftId: 100,
				path: "section-2",
				changeType: "update",
				proposed: [
					{
						for: "content",
						who: { type: "agent" },
						description: "",
						value: "Content",
						appliedAt: undefined,
					},
				],
				comments: [],
				applied: false,
				dismissed: false,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		];

		const { getByTestId, getByText } = render(
			<SectionChangePanel
				changes={tabChangesWithNoDesc}
				onApply={mockOnApply}
				onDismiss={mockOnDismiss}
				onClose={mockOnClose}
			/>,
		);

		// Click on the second tab to view the change without description
		fireEvent.click(getByTestId("change-tab-1"));

		// Should show fallback description text in the tabbed view
		expect(getByText("No description available")).toBeTruthy();
	});
});
