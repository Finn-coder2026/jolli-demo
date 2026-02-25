import { SelectBox } from "./SelectBox";
import { render, screen } from "@testing-library/preact";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./Select", () => {
	return {
		Select: ({
			children,
			onValueChange: _onValueChange,
			value: _value,
		}: {
			children: ReactNode;
			value: string;
			onValueChange: (value: string) => void;
		}) => {
			return <div data-testid="select-mock">{children}</div>;
		},
		SelectTrigger: ({
			children,
			className,
			style,
		}: {
			children: ReactNode;
			className?: string;
			style?: object;
		}) => (
			<button type="button" className={className} style={style} data-testid="select-trigger">
				{children}
			</button>
		),
		SelectValue: ({ placeholder }: { placeholder?: string }) => <div data-testid="select-value">{placeholder}</div>,
		SelectContent: ({ children, className }: { children: ReactNode; className?: string }) => (
			<div data-testid="select-content" className={className}>
				{children}
			</div>
		),
		SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
			<div data-testid="select-item" data-value={value}>
				{children}
			</div>
		),
	};
});

describe("SelectBox", () => {
	const mockOptions = [
		{ value: "option1", label: "Option 1" },
		{ value: "option2", label: "Option 2" },
		{ value: "option3", label: "Option 3" },
	];

	it("should render with default props", () => {
		const mockOnValueChange = vi.fn();
		render(<SelectBox value="option1" onValueChange={mockOnValueChange} options={mockOptions} />);

		// SelectBox should render the Select component
		expect(screen.getByTestId("select-mock")).toBeDefined();
		expect(screen.getByTestId("select-trigger")).toBeDefined();
	});

	it("should render with custom width", () => {
		const mockOnValueChange = vi.fn();
		const { container } = render(
			<SelectBox value="option1" onValueChange={mockOnValueChange} options={mockOptions} width="250px" />,
		);

		const trigger = container.querySelector("button");
		expect(trigger).toBeDefined();
		expect(trigger?.style.width).toBe("250px");
	});

	it("should render with default width when not specified", () => {
		const mockOnValueChange = vi.fn();
		const { container } = render(
			<SelectBox value="option1" onValueChange={mockOnValueChange} options={mockOptions} />,
		);

		const trigger = container.querySelector("button");
		expect(trigger).toBeDefined();
		expect(trigger?.style.width).toBe("180px");
	});

	it("should render with custom className", () => {
		const mockOnValueChange = vi.fn();
		const { container } = render(
			<SelectBox
				value="option1"
				onValueChange={mockOnValueChange}
				options={mockOptions}
				className="custom-class"
			/>,
		);

		const trigger = container.querySelector("button");
		expect(trigger?.className).toContain("custom-class");
	});

	it("should render with placeholder", () => {
		const mockOnValueChange = vi.fn();
		render(
			<SelectBox
				value=""
				onValueChange={mockOnValueChange}
				options={mockOptions}
				placeholder="Select an option"
			/>,
		);

		expect(screen.getByText("Select an option")).toBeDefined();
	});

	it("should render all options", () => {
		const mockOnValueChange = vi.fn();
		render(<SelectBox value="option1" onValueChange={mockOnValueChange} options={mockOptions} />);

		// Verify all select items are rendered
		const selectItems = screen.getAllByTestId("select-item");
		expect(selectItems.length).toBe(3);
		expect(screen.getByText("Option 1")).toBeDefined();
		expect(screen.getByText("Option 2")).toBeDefined();
		expect(screen.getByText("Option 3")).toBeDefined();
	});

	it("should pass contentClassName to SelectContent", () => {
		const mockOnValueChange = vi.fn();
		render(
			<SelectBox
				value="option1"
				onValueChange={mockOnValueChange}
				options={mockOptions}
				contentClassName="max-h-60"
			/>,
		);

		const selectContent = screen.getByTestId("select-content");
		expect(selectContent.className).toContain("max-h-60");
	});

	it("should handle empty options array", () => {
		const mockOnValueChange = vi.fn();
		render(<SelectBox value="" onValueChange={mockOnValueChange} options={[]} />);

		expect(screen.getByTestId("select-mock")).toBeDefined();
		const selectItems = screen.queryAllByTestId("select-item");
		expect(selectItems.length).toBe(0);
	});
});
