import { Input } from "./Input";
import { fireEvent, render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

describe("Input", () => {
	it("should render with default type", () => {
		const { container } = render(<Input />);
		const input = container.querySelector("input");
		expect(input).toBeDefined();
	});

	it("should render with text type", () => {
		const { container } = render(<Input type="text" />);
		const input = container.querySelector("input");
		expect(input?.type).toBe("text");
	});

	it("should render with password type", () => {
		const { container } = render(<Input type="password" />);
		const input = container.querySelector("input");
		expect(input?.type).toBe("password");
	});

	it("should render with email type", () => {
		const { container } = render(<Input type="email" />);
		const input = container.querySelector("input");
		expect(input?.type).toBe("email");
	});

	it("should render with number type", () => {
		const { container } = render(<Input type="number" />);
		const input = container.querySelector("input");
		expect(input?.type).toBe("number");
	});

	it("should apply custom className", () => {
		const { container } = render(<Input className="custom-class" />);
		const input = container.querySelector("input");
		expect(input?.className).toContain("custom-class");
	});

	it("should pass through placeholder prop", () => {
		const { container } = render(<Input placeholder="Enter text" />);
		const input = container.querySelector("input");
		expect(input?.placeholder).toBe("Enter text");
	});

	it("should pass through value prop", () => {
		const { container } = render(<Input value="test value" />);
		const input = container.querySelector("input");
		expect(input?.value).toBe("test value");
	});

	it("should handle onChange events", () => {
		const onChange = vi.fn();
		const { container } = render(<Input onChange={onChange} />);
		const input = container.querySelector("input");

		if (input) {
			fireEvent.change(input, { target: { value: "new value" } });
			expect(onChange).toHaveBeenCalled();
		}
	});

	it("should support disabled state", () => {
		const { container } = render(<Input disabled />);
		const input = container.querySelector("input");
		expect(input?.disabled).toBe(true);
	});

	it("should support readOnly state", () => {
		const { container } = render(<Input readOnly />);
		const input = container.querySelector("input");
		expect(input?.readOnly).toBe(true);
	});

	it("should support required attribute", () => {
		const { container } = render(<Input required />);
		const input = container.querySelector("input");
		expect(input?.required).toBe(true);
	});

	it("should pass through additional props", () => {
		const { container } = render(<Input data-testid="test-input" />);
		const input = container.querySelector("input");
		expect(input?.getAttribute("data-testid")).toBe("test-input");
	});

	it("should support name attribute", () => {
		const { container } = render(<Input name="username" />);
		const input = container.querySelector("input");
		expect(input?.name).toBe("username");
	});

	it("should support maxLength attribute", () => {
		const { container } = render(<Input maxLength={10} />);
		const input = container.querySelector("input");
		expect(input?.maxLength).toBe(10);
	});

	it("should support min and max for number inputs", () => {
		const { container } = render(<Input type="number" min={0} max={100} />);
		const input = container.querySelector("input");
		expect(input?.min).toBe("0");
		expect(input?.max).toBe("100");
	});

	it("should support file input type", () => {
		const { container } = render(<Input type="file" />);
		const input = container.querySelector("input");
		expect(input?.type).toBe("file");
	});

	it("should handle onFocus events", () => {
		const onFocus = vi.fn();
		const { container } = render(<Input onFocus={onFocus} />);
		const input = container.querySelector("input");

		if (input) {
			fireEvent.focus(input);
			expect(onFocus).toHaveBeenCalled();
		}
	});

	it("should handle onBlur events", () => {
		const onBlur = vi.fn();
		const { container } = render(<Input onBlur={onBlur} />);
		const input = container.querySelector("input");

		if (input) {
			fireEvent.blur(input);
			expect(onBlur).toHaveBeenCalled();
		}
	});
});
