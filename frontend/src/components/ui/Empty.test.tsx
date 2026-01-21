import { Button } from "./Button";
import { Empty } from "./Empty";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("Empty", () => {
	it("should render with title only", () => {
		render(<Empty title="No items" />);

		expect(screen.getByText("No items")).toBeDefined();
	});

	it("should render with icon", () => {
		const icon = <svg data-testid="test-icon" />;
		const { getByTestId } = render(<Empty icon={icon} title="No items" />);

		expect(getByTestId("test-icon")).toBeDefined();
	});

	it("should render with description", () => {
		render(<Empty title="No items" description="Add your first item to get started" />);

		expect(screen.getByText("No items")).toBeDefined();
		expect(screen.getByText("Add your first item to get started")).toBeDefined();
	});

	it("should render with action button", () => {
		const action = <Button data-testid="action-button">Create New</Button>;
		const { getByTestId } = render(<Empty title="No items" action={action} />);

		expect(getByTestId("action-button")).toBeDefined();
	});

	it("should render with custom className", () => {
		const { container } = render(<Empty title="No items" className="custom-class" />);

		const wrapper = container.querySelector(".custom-class");
		expect(wrapper).toBeDefined();
	});

	it("should render all props together", () => {
		const icon = <svg data-testid="test-icon" />;
		const action = <Button data-testid="action-button">Create New</Button>;

		const { getByTestId } = render(
			<Empty
				icon={icon}
				title="No items found"
				description="Try creating a new item"
				action={action}
				className="my-empty-state"
			/>,
		);

		expect(screen.getByText("No items found")).toBeDefined();
		expect(screen.getByText("Try creating a new item")).toBeDefined();
		expect(getByTestId("test-icon")).toBeDefined();
		expect(getByTestId("action-button")).toBeDefined();
	});

	it("should render without icon when not provided", () => {
		const { container } = render(<Empty title="No items" />);

		// Icon container should not exist
		const iconContainer = container.querySelector(".text-muted-foreground");
		expect(iconContainer).toBeNull();
	});

	it("should render without description when not provided", () => {
		render(<Empty title="No items" />);

		// Only title should exist
		expect(screen.getByText("No items")).toBeDefined();

		// Description paragraph should not exist
		const paragraphs = document.querySelectorAll("p");
		expect(paragraphs.length).toBe(0);
	});

	it("should render without action when not provided", () => {
		const { container } = render(<Empty title="No items" />);

		// Action container should not exist
		const actionContainer = container.querySelector(".mt-2");
		expect(actionContainer).toBeNull();
	});
});
