import { TogglePill } from "./TogglePill";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

describe("TogglePill", () => {
	it("should render both options", () => {
		const onChange = vi.fn();
		const options = [
			{ value: "option1", label: "Option 1" },
			{ value: "option2", label: "Option 2" },
		] as const;

		render(<TogglePill options={options} value="option1" onChange={onChange} />);

		expect(screen.getByText("Option 1")).toBeDefined();
		expect(screen.getByText("Option 2")).toBeDefined();
	});

	it("should highlight the selected option", () => {
		const onChange = vi.fn();
		const options = [
			{ value: "option1", label: "Option 1" },
			{ value: "option2", label: "Option 2" },
		] as const;

		render(<TogglePill options={options} value="option1" onChange={onChange} />);

		const option1Button = screen.getByText("Option 1").closest("button");
		const option2Button = screen.getByText("Option 2").closest("button");

		expect(option1Button?.getAttribute("aria-pressed")).toBe("true");
		expect(option2Button?.getAttribute("aria-pressed")).toBe("false");
	});

	it("should call onChange when clicking an option", () => {
		const onChange = vi.fn();
		const options = [
			{ value: "option1", label: "Option 1" },
			{ value: "option2", label: "Option 2" },
		] as const;

		render(<TogglePill options={options} value="option1" onChange={onChange} />);

		const option2Button = screen.getByText("Option 2");
		fireEvent.click(option2Button);

		expect(onChange).toHaveBeenCalledWith("option2");
	});

	it("should render with icons when provided", () => {
		const onChange = vi.fn();
		const options = [
			{ value: "option1", label: "Option 1", icon: <span>Icon1</span> },
			{ value: "option2", label: "Option 2", icon: <span>Icon2</span> },
		] as const;

		render(<TogglePill options={options} value="option1" onChange={onChange} />);

		expect(screen.getByText("Icon1")).toBeDefined();
		expect(screen.getByText("Icon2")).toBeDefined();
	});

	it("should apply custom className", () => {
		const onChange = vi.fn();
		const options = [
			{ value: "option1", label: "Option 1" },
			{ value: "option2", label: "Option 2" },
		] as const;

		const { container } = render(
			<TogglePill options={options} value="option1" onChange={onChange} className="custom-class" />,
		);

		const pillContainer = container.querySelector(".custom-class");
		expect(pillContainer).toBeDefined();
	});

	it("should allow switching between options", () => {
		const onChange = vi.fn();
		const options = [
			{ value: "rendered", label: "Rendered" },
			{ value: "raw", label: "Raw" },
		] as const;

		const { rerender } = render(<TogglePill options={options} value="rendered" onChange={onChange} />);

		const rawButton = screen.getByText("Raw");
		fireEvent.click(rawButton);

		expect(onChange).toHaveBeenCalledWith("raw");

		// Simulate parent updating the value
		rerender(<TogglePill options={options} value="raw" onChange={onChange} />);

		const rawButtonAfter = screen.getByText("Raw").closest("button");
		const renderedButtonAfter = screen.getByText("Rendered").closest("button");

		expect(rawButtonAfter?.getAttribute("aria-pressed")).toBe("true");
		expect(renderedButtonAfter?.getAttribute("aria-pressed")).toBe("false");
	});
});
