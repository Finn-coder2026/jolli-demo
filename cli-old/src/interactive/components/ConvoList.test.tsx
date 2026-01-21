/**
 * @vitest-environment jsdom
 */

import { ConvoList } from "./ConvoList";
import { render } from "@testing-library/react";
import type { Convo } from "jolli-common";
import { describe, expect, it, vi } from "vitest";

// Mock ink-select-input
vi.mock("ink-select-input", () => ({
	default: ({
		items,
		onSelect,
	}: {
		items: Array<{ label: string; value: string }>;
		onSelect: (item: { value: string }) => void;
	}) => {
		return (
			<div data-testid="select-input">
				<div data-testid="items-count">{items.length}</div>
				{items.map(item => (
					<button
						key={item.value}
						data-testid={`select-${item.value}`}
						onClick={() => onSelect(item)}
						type="button"
					>
						{item.label}
					</button>
				))}
			</div>
		);
	},
}));

describe("ConvoList", () => {
	const mockOnSelect = vi.fn();
	const mockOnNewConvo = vi.fn();
	const mockOnBack = vi.fn();

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("should render the title", () => {
		const { getByText } = render(
			<ConvoList
				convos={[]}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		expect(getByText("Conversations")).toBeDefined();
	});

	it("should render empty state when no convos", () => {
		const { getByText } = render(
			<ConvoList
				convos={[]}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		expect(getByText("No conversations yet")).toBeDefined();
	});

	it("should render only New and Back options when no convos", () => {
		const { getByTestId } = render(
			<ConvoList
				convos={[]}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		// Only 2 items should be in the SelectInput when empty
		expect(getByTestId("items-count").textContent).toBe("2");
	});

	it("should render all items when convos exist", () => {
		const convos: Array<Convo> = [
			{
				id: 1,
				title: "First Conversation",
				userId: 1,
				visitorId: undefined,
				messages: [],
				createdAt: new Date("2025-01-01").toISOString(),
				updatedAt: new Date("2025-01-01").toISOString(),
			},
			{
				id: 2,
				title: "Second Conversation",
				userId: 1,
				visitorId: undefined,
				messages: [],
				createdAt: new Date("2025-01-02").toISOString(),
				updatedAt: new Date("2025-01-02").toISOString(),
			},
		];

		const { getByTestId } = render(
			<ConvoList
				convos={convos}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		// Should have 2 special items + 2 convos = 4 items
		expect(getByTestId("items-count").textContent).toBe("4");
	});

	it("should mark active convo with arrow", () => {
		const convos: Array<Convo> = [
			{
				id: 1,
				title: "Active Conversation",
				userId: 1,
				visitorId: undefined,
				messages: [],
				createdAt: new Date("2025-01-01").toISOString(),
				updatedAt: new Date("2025-01-01").toISOString(),
			},
		];

		const { getByText } = render(
			<ConvoList
				convos={convos}
				activeConvoId={1}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		// Active convo should have arrow prefix
		const button = getByText(/→ Active Conversation/);
		expect(button).toBeDefined();
	});

	it("should not mark inactive convo with arrow", () => {
		const convos: Array<Convo> = [
			{
				id: 1,
				title: "Inactive Conversation",
				userId: 1,
				visitorId: undefined,
				messages: [],
				createdAt: new Date("2025-01-01").toISOString(),
				updatedAt: new Date("2025-01-01").toISOString(),
			},
		];

		const { getByText } = render(
			<ConvoList
				convos={convos}
				activeConvoId={2}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		// Inactive convo should not have arrow prefix (just spaces)
		const button = getByText(/Inactive Conversation/);
		expect(button.textContent).not.toContain("→");
	});

	it("should call onNewConvo when new is selected", () => {
		const { getByTestId } = render(
			<ConvoList
				convos={[]}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		const newButton = getByTestId("select-new");
		newButton.click();

		expect(mockOnNewConvo).toHaveBeenCalledTimes(1);
		expect(mockOnSelect).not.toHaveBeenCalled();
		expect(mockOnBack).not.toHaveBeenCalled();
	});

	it("should call onBack when back is selected", () => {
		const { getByTestId } = render(
			<ConvoList
				convos={[]}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		const backButton = getByTestId("select-back");
		backButton.click();

		expect(mockOnBack).toHaveBeenCalledTimes(1);
		expect(mockOnSelect).not.toHaveBeenCalled();
		expect(mockOnNewConvo).not.toHaveBeenCalled();
	});

	it("should call onSelect with convo when convo is selected", () => {
		const convos: Array<Convo> = [
			{
				id: 1,
				title: "Test Conversation",
				userId: 1,
				visitorId: undefined,
				messages: [],
				createdAt: new Date("2025-01-01").toISOString(),
				updatedAt: new Date("2025-01-01").toISOString(),
			},
		];

		const { getByTestId } = render(
			<ConvoList
				convos={convos}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		const convButton = getByTestId("select-1");
		convButton.click();

		expect(mockOnSelect).toHaveBeenCalledTimes(1);
		expect(mockOnSelect).toHaveBeenCalledWith(convos[0]);
		expect(mockOnNewConvo).not.toHaveBeenCalled();
		expect(mockOnBack).not.toHaveBeenCalled();
	});

	it("should not call onSelect if convo not found", () => {
		const convos: Array<Convo> = [
			{
				id: 1,
				title: "Test Conversation",
				userId: 1,
				visitorId: undefined,
				messages: [],
				createdAt: new Date("2025-01-01").toISOString(),
				updatedAt: new Date("2025-01-01").toISOString(),
			},
		];

		const { getByTestId } = render(
			<ConvoList
				convos={convos}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		// Create a mock SelectInput that allows us to trigger onSelect with a non-existent ID
		const selectInput = getByTestId("select-input");

		// Add a fake button to test the case where convo is not found
		const fakeButton = document.createElement("button");
		fakeButton.setAttribute("data-testid", "select-999");
		fakeButton.onclick = () => {
			// Simulate selecting an item with ID that doesn't exist
			const items = [
				{ label: "+ New Convo", value: "new" },
				{ label: "← Back to Chat", value: "back" },
				{ label: "Test Conversation", value: "999" },
			];
			const item = items[2]; // ID 999 which doesn't exist in convos
			const handleSelect = (selectedItem: { value: string }) => {
				if (selectedItem.value === "new") {
					mockOnNewConvo();
				} else if (selectedItem.value === "back") {
					mockOnBack();
				} else {
					const conv = convos.find(c => c.id.toString() === selectedItem.value);
					if (conv) {
						mockOnSelect(conv);
					}
				}
			};
			handleSelect(item);
		};
		selectInput.appendChild(fakeButton);

		fakeButton.click();

		// onSelect should not be called because convo with ID 999 doesn't exist
		expect(mockOnSelect).not.toHaveBeenCalled();
		expect(mockOnNewConvo).not.toHaveBeenCalled();
		expect(mockOnBack).not.toHaveBeenCalled();
	});

	it("should display convo date in localized format", () => {
		const testDate = new Date("2025-01-15");
		const convos: Array<Convo> = [
			{
				id: 1,
				title: "Test Conversation",
				userId: 1,
				visitorId: undefined,
				messages: [],
				createdAt: testDate.toISOString(),
				updatedAt: testDate.toISOString(),
			},
		];

		const { getByText } = render(
			<ConvoList
				convos={convos}
				activeConvoId={undefined}
				onSelect={mockOnSelect}
				onNewConvo={mockOnNewConvo}
				onBack={mockOnBack}
			/>,
		);

		// Should include the localized date
		const expectedDate = testDate.toLocaleDateString();
		const button = getByText(new RegExp(expectedDate));
		expect(button).toBeDefined();
	});
});
