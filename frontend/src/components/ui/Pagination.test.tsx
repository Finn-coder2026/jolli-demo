import { Pagination } from "./Pagination";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

describe("Pagination", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});
	it("should render page numbers and navigation buttons", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);

		// Check for page buttons
		expect(screen.getByRole("button", { name: "Page 1" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 2" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 3" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 4" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 5" })).toBeDefined();

		// Check for navigation buttons
		expect(screen.getByLabelText("Previous page")).toBeDefined();
		expect(screen.getByLabelText("Next page")).toBeDefined();
	});

	it("should disable previous button on first page", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);

		const prevButton = screen.getByLabelText("Previous page") as HTMLButtonElement;
		expect(prevButton.disabled).toBe(true);
	});

	it("should disable next button on last page", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={5} totalPages={5} onPageChange={onPageChange} />);

		const nextButton = screen.getByLabelText("Next page") as HTMLButtonElement;
		expect(nextButton.disabled).toBe(true);
	});

	it("should call onPageChange when clicking page number", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={1} totalPages={5} onPageChange={onPageChange} />);

		fireEvent.click(screen.getByRole("button", { name: "Page 3" }));
		expect(onPageChange).toHaveBeenCalledWith(3);
	});

	it("should call onPageChange when clicking next button", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />);

		fireEvent.click(screen.getByLabelText("Next page"));
		expect(onPageChange).toHaveBeenCalledWith(3);
	});

	it("should call onPageChange when clicking previous button", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />);

		fireEvent.click(screen.getByLabelText("Previous page"));
		expect(onPageChange).toHaveBeenCalledWith(2);
	});

	it("should highlight current page", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={3} totalPages={5} onPageChange={onPageChange} />);

		const currentPageButton = screen.getByRole("button", { name: "Page 3", current: "page" });
		expect(currentPageButton).toBeDefined();
	});

	it("should show ellipsis for large page counts (current page near start)", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={2} totalPages={10} onPageChange={onPageChange} />);

		// Should show: [1] [2] [3] [4] ... [10]
		expect(screen.getByRole("button", { name: "Page 1" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 2" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 3" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 4" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 10" })).toBeDefined();
		expect(screen.getByText("...")).toBeDefined();
	});

	it("should show ellipsis for large page counts (current page in middle)", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={5} totalPages={10} onPageChange={onPageChange} />);

		// Should show: [1] ... [4] [5] [6] ... [10]
		expect(screen.getByRole("button", { name: "Page 1" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 4" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 5" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 6" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 10" })).toBeDefined();
		expect(screen.getAllByText("...")).toHaveLength(2);
	});

	it("should show ellipsis for large page counts (current page near end)", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={9} totalPages={10} onPageChange={onPageChange} />);

		// Should show: [1] ... [7] [8] [9] [10]
		expect(screen.getByRole("button", { name: "Page 1" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 7" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 8" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 9" })).toBeDefined();
		expect(screen.getByRole("button", { name: "Page 10" })).toBeDefined();
		expect(screen.getByText("...")).toBeDefined();
	});

	it("should show all pages when total pages is 7 or less", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={3} totalPages={7} onPageChange={onPageChange} />);

		// Should show all pages without ellipsis
		for (let i = 1; i <= 7; i++) {
			expect(screen.getByRole("button", { name: `Page ${i}` })).toBeDefined();
		}
		expect(screen.queryByText("...")).toBeNull();
	});

	it("should show all pages when total pages is 1", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={1} totalPages={1} onPageChange={onPageChange} />);

		expect(screen.getByRole("button", { name: "Page 1" })).toBeDefined();
		expect(screen.queryByText("...")).toBeNull();
	});

	it("should have proper aria labels for accessibility", () => {
		const onPageChange = vi.fn();
		render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />);

		expect(screen.getByRole("navigation", { name: "Pagination" })).toBeDefined();
		expect(screen.getByLabelText("Previous page")).toBeDefined();
		expect(screen.getByLabelText("Next page")).toBeDefined();
		expect(screen.getByLabelText("Page 1")).toBeDefined();
	});

	it("should handle Intlayer Proxy objects in getStringValue", () => {
		// Test that the component correctly extracts string values from IntlayerNode objects
		// The global smart mock in Vitest.tsx provides IntlayerNode objects with .value properties
		// The component should handle these correctly via getStringValue

		const onPageChange = vi.fn();
		render(<Pagination currentPage={2} totalPages={5} onPageChange={onPageChange} />);

		// The aria-labels should have strings extracted from IntlayerNode objects
		expect(screen.getByRole("navigation", { name: "Pagination" })).toBeDefined();
		expect(screen.getByLabelText("Previous page")).toBeDefined();
		expect(screen.getByLabelText("Next page")).toBeDefined();
		expect(screen.getByLabelText("Page 1")).toBeDefined();
	});
});
