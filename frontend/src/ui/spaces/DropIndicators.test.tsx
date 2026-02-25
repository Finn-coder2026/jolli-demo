import { DropIndicator, DropLine, FolderHighlight } from "./DropIndicators";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("DropLine", () => {
	it("should render with before position", () => {
		render(<DropLine position="before" depth={0} isValid={true} />);

		const line = screen.getByTestId("drop-line");
		expect(line).toBeDefined();
		expect(line.getAttribute("data-position")).toBe("before");
		expect(line.getAttribute("data-valid")).toBe("true");
	});

	it("should render with after position", () => {
		render(<DropLine position="after" depth={0} isValid={true} />);

		const line = screen.getByTestId("drop-line");
		expect(line.getAttribute("data-position")).toBe("after");
	});

	it("should show invalid styling when isValid is false", () => {
		render(<DropLine position="before" depth={0} isValid={false} />);

		const line = screen.getByTestId("drop-line");
		expect(line.getAttribute("data-valid")).toBe("false");
		expect(line.className).toContain("bg-red-500");
	});

	it("should show valid styling when isValid is true", () => {
		render(<DropLine position="before" depth={0} isValid={true} />);

		const line = screen.getByTestId("drop-line");
		expect(line.className).toContain("bg-blue-500");
	});

	it("should apply indentation based on depth", () => {
		const { rerender } = render(<DropLine position="before" depth={0} isValid={true} />);

		let line = screen.getByTestId("drop-line");
		// depth 0: 0 * 16 + 8 + 20 (icon offset) = 28px
		expect(line.style.marginLeft).toBe("28px");

		rerender(<DropLine position="before" depth={2} isValid={true} />);

		line = screen.getByTestId("drop-line");
		// depth 2: 2 * 16 + 8 + 20 = 60px
		expect(line.style.marginLeft).toBe("60px");
	});
});

describe("FolderHighlight", () => {
	it("should render with valid styling", () => {
		render(<FolderHighlight isValid={true} />);

		const highlight = screen.getByTestId("folder-highlight");
		expect(highlight).toBeDefined();
		expect(highlight.getAttribute("data-valid")).toBe("true");
		expect(highlight.className).toContain("ring-primary");
		expect(highlight.className).toContain("bg-primary/10");
	});

	it("should render with invalid styling", () => {
		render(<FolderHighlight isValid={false} />);

		const highlight = screen.getByTestId("folder-highlight");
		expect(highlight.getAttribute("data-valid")).toBe("false");
		expect(highlight.className).toContain("ring-destructive");
		expect(highlight.className).toContain("bg-destructive/10");
	});
});

describe("DropIndicator", () => {
	it("should render FolderHighlight for inside position", () => {
		render(<DropIndicator position="inside" depth={0} isValid={true} />);

		expect(screen.getByTestId("folder-highlight")).toBeDefined();
		expect(screen.queryByTestId("drop-line")).toBeNull();
	});

	it("should render DropLine for before position", () => {
		render(<DropIndicator position="before" depth={1} isValid={true} />);

		expect(screen.getByTestId("drop-line")).toBeDefined();
		expect(screen.queryByTestId("folder-highlight")).toBeNull();
		expect(screen.getByTestId("drop-line").getAttribute("data-position")).toBe("before");
	});

	it("should render DropLine for after position", () => {
		render(<DropIndicator position="after" depth={2} isValid={false} />);

		expect(screen.getByTestId("drop-line")).toBeDefined();
		expect(screen.queryByTestId("folder-highlight")).toBeNull();
		expect(screen.getByTestId("drop-line").getAttribute("data-position")).toBe("after");
		expect(screen.getByTestId("drop-line").getAttribute("data-valid")).toBe("false");
	});

	it("should pass depth to DropLine", () => {
		render(<DropIndicator position="before" depth={3} isValid={true} />);

		const line = screen.getByTestId("drop-line");
		// depth 3: 3 * 16 + 8 + 20 (icon offset) = 76px
		expect(line.style.marginLeft).toBe("76px");
	});

	it("should pass isValid to FolderHighlight", () => {
		render(<DropIndicator position="inside" depth={0} isValid={false} />);

		const highlight = screen.getByTestId("folder-highlight");
		expect(highlight.getAttribute("data-valid")).toBe("false");
	});
});
