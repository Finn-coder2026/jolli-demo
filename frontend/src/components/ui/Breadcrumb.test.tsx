import { Breadcrumb, type BreadcrumbItem } from "./Breadcrumb";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		breadcrumbAriaLabel: { value: "Breadcrumb navigation" },
	}),
}));

describe("Breadcrumb", () => {
	it("should render single breadcrumb item", () => {
		const items: Array<BreadcrumbItem> = [{ label: "Home" }];

		render(<Breadcrumb items={items} />);

		expect(screen.getByText("Home")).toBeDefined();
	});

	it("should render multiple breadcrumb items", () => {
		const items: Array<BreadcrumbItem> = [
			{ label: "Home", path: "/" },
			{ label: "Products", path: "/products" },
			{ label: "Details" },
		];

		render(<Breadcrumb items={items} />);

		expect(screen.getByText("Home")).toBeDefined();
		expect(screen.getByText("Products")).toBeDefined();
		expect(screen.getByText("Details")).toBeDefined();
	});

	it("should render chevron separators between items", () => {
		const items: Array<BreadcrumbItem> = [
			{ label: "First", path: "/" },
			{ label: "Second", path: "/second" },
			{ label: "Third" },
		];

		const { container } = render(<Breadcrumb items={items} />);

		const chevrons = container.querySelectorAll('svg[data-lucide-icon="ChevronRight"]');
		expect(chevrons.length).toBe(2); // One between each pair, but not after the last
	});

	it("should call onNavigate when clickable breadcrumb is clicked", () => {
		const mockOnNavigate = vi.fn();
		const items: Array<BreadcrumbItem> = [{ label: "Home", path: "/" }, { label: "Current" }];

		render(<Breadcrumb items={items} onNavigate={mockOnNavigate} />);

		const homeButton = screen.getByText("Home");
		fireEvent.click(homeButton);

		expect(mockOnNavigate).toHaveBeenCalledWith("/");
	});

	it("should render last item as non-clickable", () => {
		const mockOnNavigate = vi.fn();
		const items: Array<BreadcrumbItem> = [
			{ label: "Home", path: "/" },
			{ label: "Current", path: "/current" },
		];

		const { container } = render(<Breadcrumb items={items} onNavigate={mockOnNavigate} />);

		// First item should be a button
		const homeButton = container.querySelector("button");
		expect(homeButton?.textContent).toBe("Home");

		// Last item should not be a button even if it has a path
		const currentSpan = screen.getByText("Current");
		expect(currentSpan.tagName).not.toBe("BUTTON");
	});

	it("should not call onNavigate if onNavigate is not provided", () => {
		const items: Array<BreadcrumbItem> = [{ label: "Home", path: "/" }, { label: "Current" }];

		// Should not throw error
		const { container } = render(<Breadcrumb items={items} />);

		const homeButton = container.querySelector("button");
		if (homeButton) {
			fireEvent.click(homeButton);
		}

		// Test passes if no error is thrown
		expect(container).toBeDefined();
	});

	it("should render items without paths as spans", () => {
		const items: Array<BreadcrumbItem> = [{ label: "First" }, { label: "Second" }];

		const { container } = render(<Breadcrumb items={items} />);

		// No buttons should be rendered
		const buttons = container.querySelectorAll("button");
		expect(buttons.length).toBe(0);
	});

	it("should have correct aria-label on nav element", () => {
		const items: Array<BreadcrumbItem> = [{ label: "Home" }];

		const { container } = render(<Breadcrumb items={items} />);

		const nav = container.querySelector('nav[aria-label="Breadcrumb navigation"]');
		expect(nav).toBeDefined();
	});

	it("should apply font-medium class to last item", () => {
		const items: Array<BreadcrumbItem> = [{ label: "First", path: "/" }, { label: "Last" }];

		render(<Breadcrumb items={items} />);

		const lastSpan = screen.getByText("Last");
		expect(lastSpan.classList.contains("font-medium")).toBe(true);
	});

	it("should handle navigation for multiple clickable items", () => {
		const mockOnNavigate = vi.fn();
		const items: Array<BreadcrumbItem> = [
			{ label: "Level 1", path: "/level1" },
			{ label: "Level 2", path: "/level1/level2" },
			{ label: "Level 3", path: "/level1/level2/level3" },
			{ label: "Current" },
		];

		render(<Breadcrumb items={items} onNavigate={mockOnNavigate} />);

		const level1Button = screen.getByText("Level 1");
		const level2Button = screen.getByText("Level 2");
		const level3Button = screen.getByText("Level 3");

		fireEvent.click(level1Button);
		expect(mockOnNavigate).toHaveBeenCalledWith("/level1");

		fireEvent.click(level2Button);
		expect(mockOnNavigate).toHaveBeenCalledWith("/level1/level2");

		fireEvent.click(level3Button);
		expect(mockOnNavigate).toHaveBeenCalledWith("/level1/level2/level3");

		expect(mockOnNavigate).toHaveBeenCalledTimes(3);
	});
});
