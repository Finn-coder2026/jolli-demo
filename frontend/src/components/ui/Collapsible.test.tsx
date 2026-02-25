import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./Collapsible";
import { fireEvent, render, screen } from "@testing-library/preact";
import { useState } from "react";
import { describe, expect, it } from "vitest";

describe("Collapsible", () => {
	it("should render Collapsible with trigger and content", () => {
		render(
			<Collapsible>
				<CollapsibleTrigger>Toggle</CollapsibleTrigger>
				<CollapsibleContent>Collapsible content</CollapsibleContent>
			</Collapsible>,
		);

		expect(screen.getByText("Toggle")).toBeDefined();
		expect(screen.getByText("Collapsible content")).toBeDefined();
	});

	it("should render Collapsible in closed state by default", () => {
		const { container } = render(
			<Collapsible>
				<CollapsibleTrigger>Toggle</CollapsibleTrigger>
				<CollapsibleContent>Content</CollapsibleContent>
			</Collapsible>,
		);

		const root = container.querySelector('[data-radix-collapsible="Root"]');
		expect(root).toBeDefined();
		expect(root?.getAttribute("data-state")).toBe("closed");
	});

	it("should render Collapsible in open state when open prop is true", () => {
		const { container } = render(
			<Collapsible open={true}>
				<CollapsibleTrigger>Toggle</CollapsibleTrigger>
				<CollapsibleContent>Content</CollapsibleContent>
			</Collapsible>,
		);

		const root = container.querySelector('[data-radix-collapsible="Root"]');
		expect(root).toBeDefined();
		expect(root?.getAttribute("data-state")).toBe("open");
	});

	it("should call onOpenChange when trigger is clicked", () => {
		function TestComponent() {
			const [open, setOpen] = useState(false);
			return (
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
					<CollapsibleContent>Content</CollapsibleContent>
				</Collapsible>
			);
		}

		const { container } = render(<TestComponent />);

		// Initially closed
		let root = container.querySelector('[data-radix-collapsible="Root"]');
		expect(root?.getAttribute("data-state")).toBe("closed");

		// Click trigger
		fireEvent.click(screen.getByTestId("trigger"));

		// Should be open now
		root = container.querySelector('[data-radix-collapsible="Root"]');
		expect(root?.getAttribute("data-state")).toBe("open");
	});

	it("should render CollapsibleTrigger with asChild prop", () => {
		render(
			<Collapsible>
				<CollapsibleTrigger asChild>
					<button type="button" data-testid="custom-trigger">
						Custom Trigger
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent>Content</CollapsibleContent>
			</Collapsible>,
		);

		expect(screen.getByTestId("custom-trigger")).toBeDefined();
		expect(screen.getByText("Custom Trigger")).toBeDefined();
	});

	it("should toggle state when clicking custom trigger with asChild", () => {
		function TestComponent() {
			const [open, setOpen] = useState(false);
			return (
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleTrigger asChild>
						<button type="button" data-testid="custom-trigger">
							Toggle
						</button>
					</CollapsibleTrigger>
					<CollapsibleContent>Content</CollapsibleContent>
				</Collapsible>
			);
		}

		const { container } = render(<TestComponent />);

		// Initially closed
		let root = container.querySelector('[data-radix-collapsible="Root"]');
		expect(root?.getAttribute("data-state")).toBe("closed");

		// Click custom trigger
		fireEvent.click(screen.getByTestId("custom-trigger"));

		// Should be open now
		root = container.querySelector('[data-radix-collapsible="Root"]');
		expect(root?.getAttribute("data-state")).toBe("open");
	});

	it("should render CollapsibleContent with correct data attribute", () => {
		const { container } = render(
			<Collapsible>
				<CollapsibleTrigger>Toggle</CollapsibleTrigger>
				<CollapsibleContent>Content here</CollapsibleContent>
			</Collapsible>,
		);

		const content = container.querySelector('[data-radix-collapsible="Content"]');
		expect(content).toBeDefined();
		expect(content?.textContent).toBe("Content here");
	});

	it("should render nested content within CollapsibleContent", () => {
		render(
			<Collapsible open={true}>
				<CollapsibleTrigger>Toggle</CollapsibleTrigger>
				<CollapsibleContent>
					<div data-testid="nested-content">
						<p>Nested paragraph</p>
						<span>Nested span</span>
					</div>
				</CollapsibleContent>
			</Collapsible>,
		);

		expect(screen.getByTestId("nested-content")).toBeDefined();
		expect(screen.getByText("Nested paragraph")).toBeDefined();
		expect(screen.getByText("Nested span")).toBeDefined();
	});
});
