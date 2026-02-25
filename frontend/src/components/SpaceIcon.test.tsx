import { SpaceIcon } from "./SpaceIcon";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("SpaceIcon", () => {
	it("should render with correct initial letter", () => {
		render(<SpaceIcon name="Test Space" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.textContent).toBe("T");
	});

	it("should apply correct color class based on name", () => {
		render(<SpaceIcon name="Default Space" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("bg-");
	});

	it("should render size 5 by default", () => {
		render(<SpaceIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("h-5");
		expect(icon.className).toContain("w-5");
	});

	it("should render size 6 when specified", () => {
		render(<SpaceIcon name="Test" size={6} data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("h-6");
		expect(icon.className).toContain("w-6");
	});

	it("should render size 8 when specified", () => {
		render(<SpaceIcon name="Test" size={8} data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("h-8");
		expect(icon.className).toContain("w-8");
	});

	it("should apply custom className", () => {
		render(<SpaceIcon name="Test" className="custom-class" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("custom-class");
	});

	it("should handle empty name", () => {
		render(<SpaceIcon name="" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon).toBeDefined();
	});

	it("should have white text color", () => {
		render(<SpaceIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("text-white");
	});

	it("should have rounded corners", () => {
		render(<SpaceIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("rounded");
	});

	it("should be flex-shrink-0", () => {
		render(<SpaceIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("flex-shrink-0");
	});

	it("should center content with flexbox", () => {
		render(<SpaceIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("flex");
		expect(icon.className).toContain("items-center");
		expect(icon.className).toContain("justify-center");
	});

	it("should have font-semibold", () => {
		render(<SpaceIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("font-semibold");
	});

	it("should handle special characters in name", () => {
		render(<SpaceIcon name="@special" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.textContent).toBe("@");
	});

	it("should handle unicode characters", () => {
		render(<SpaceIcon name="中文空间" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.textContent).toBeTruthy();
	});
});
