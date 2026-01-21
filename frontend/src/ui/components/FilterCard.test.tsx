import { renderWithProviders } from "../../test/TestUtils";
import { FilterCard } from "./FilterCard";
import { fireEvent } from "@testing-library/preact";
import { FileText } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

describe("FilterCard", () => {
	it("renders with title and count", () => {
		const onClick = vi.fn();

		const { getByTestId, getByText } = renderWithProviders(
			<FilterCard
				title="All Articles"
				count={42}
				icon={FileText}
				selected={false}
				onClick={onClick}
				testId="filter-card-all"
			/>,
		);

		expect(getByTestId("filter-card-all")).toBeTruthy();
		expect(getByText("42")).toBeTruthy();
		expect(getByText("All Articles")).toBeTruthy();
	});

	it("calls onClick when clicked", () => {
		const onClick = vi.fn();

		const { getByTestId } = renderWithProviders(
			<FilterCard
				title="My Drafts"
				count={5}
				icon={FileText}
				selected={false}
				onClick={onClick}
				testId="filter-card-my-drafts"
			/>,
		);

		fireEvent.click(getByTestId("filter-card-my-drafts"));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("applies selected styles when selected is true", () => {
		const onClick = vi.fn();

		const { getByTestId } = renderWithProviders(
			<FilterCard
				title="Selected Card"
				count={10}
				icon={FileText}
				selected={true}
				onClick={onClick}
				testId="filter-card-selected"
			/>,
		);

		const button = getByTestId("filter-card-selected");
		expect(button.className).toContain("bg-primary/10");
		expect(button.className).toContain("border-primary");
	});

	it("applies default styles when not selected", () => {
		const onClick = vi.fn();

		const { getByTestId } = renderWithProviders(
			<FilterCard
				title="Unselected Card"
				count={3}
				icon={FileText}
				selected={false}
				onClick={onClick}
				testId="filter-card-unselected"
			/>,
		);

		const button = getByTestId("filter-card-unselected");
		expect(button.className).toContain("bg-card");
		expect(button.className).toContain("border-border");
	});

	it("renders with zero count", () => {
		const onClick = vi.fn();

		const { getByText } = renderWithProviders(
			<FilterCard title="Empty" count={0} icon={FileText} selected={false} onClick={onClick} />,
		);

		expect(getByText("0")).toBeTruthy();
	});

	it("renders with ReactNode title", () => {
		const onClick = vi.fn();

		const { getByText } = renderWithProviders(
			<FilterCard
				title={<span data-testid="custom-title">Custom Title</span>}
				count={7}
				icon={FileText}
				selected={false}
				onClick={onClick}
			/>,
		);

		expect(getByText("Custom Title")).toBeTruthy();
	});
});
