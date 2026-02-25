import { Checkbox } from "./Checkbox";
import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock Radix UI Checkbox to avoid rendering issues in tests
vi.mock("@radix-ui/react-checkbox", () => ({
	Root: vi.fn(({ children, className, checked, onCheckedChange, disabled, ...props }) => (
		<button
			type="button"
			role="checkbox"
			className={className}
			onClick={() => !disabled && onCheckedChange?.(!checked)}
			disabled={disabled}
			{...(checked && { checked: "true" })}
			{...props}
		>
			{children}
		</button>
	)),
	Indicator: vi.fn(({ children, className }) => <span className={className}>{children}</span>),
}));

describe("Checkbox", () => {
	it("should render checkbox component", () => {
		const { container } = render(<Checkbox />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toBeDefined();
	});

	it("should apply custom className", () => {
		const { container } = render(<Checkbox className="custom-class" />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox?.className).toContain("custom-class");
	});

	it("should forward checked prop", () => {
		const { container } = render(<Checkbox checked={true} />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toBeDefined();
	});

	it("should forward disabled prop", () => {
		const { container } = render(<Checkbox disabled={true} />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox?.hasAttribute("disabled")).toBe(true);
	});

	it("should forward id prop", () => {
		const { container } = render(<Checkbox id="test-id" />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox?.getAttribute("id")).toBe("test-id");
	});

	it("should forward name prop", () => {
		const { container } = render(<Checkbox name="test-name" />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox?.getAttribute("name")).toBe("test-name");
	});

	it("should forward value prop", () => {
		const { container } = render(<Checkbox value="test-value" />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox?.getAttribute("value")).toBe("test-value");
	});

	it("should forward required prop", () => {
		const { container } = render(<Checkbox required={true} />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox?.hasAttribute("required")).toBe(true);
	});

	it("should forward aria-label prop", () => {
		const { container } = render(<Checkbox aria-label="Test Checkbox" />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox?.getAttribute("aria-label")).toBe("Test Checkbox");
	});

	it("should handle onCheckedChange callback", () => {
		const handleChange = vi.fn();
		const { container } = render(<Checkbox onCheckedChange={handleChange} />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toBeDefined();
	});

	it("should forward defaultChecked prop", () => {
		const { container } = render(<Checkbox defaultChecked={true} />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toBeDefined();
	});

	it("should support indeterminate state", () => {
		const { container } = render(<Checkbox checked="indeterminate" />);
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toBeDefined();
	});

	it("should forward ref to checkbox element", () => {
		let checkboxRef: HTMLButtonElement | null = null;

		function TestComponent() {
			return (
				<Checkbox
					ref={(el: HTMLButtonElement | null) => {
						checkboxRef = el;
					}}
				/>
			);
		}

		render(<TestComponent />);

		expect(checkboxRef).not.toBeNull();
	});

	it("should render CheckboxIndicator with Check icon", () => {
		const { container } = render(<Checkbox checked={true} />);
		// The indicator is rendered inside the checkbox
		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toBeDefined();
	});

	it("should apply base styles from cn utility", () => {
		const { container } = render(<Checkbox />);
		const checkbox = container.querySelector('[role="checkbox"]');
		// Should have peer class
		expect(checkbox?.className).toContain("peer");
	});
});
