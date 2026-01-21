import { Button } from "./Button";
import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

describe("Button", () => {
	it("should render with default variant", () => {
		const { container } = render(<Button>Default</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Default");
	});

	it("should render with destructive variant", () => {
		const { container } = render(<Button variant="destructive">Destructive</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Destructive");
	});

	it("should render with outline variant", () => {
		const { container } = render(<Button variant="outline">Outline</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Outline");
	});

	it("should render with secondary variant", () => {
		const { container } = render(<Button variant="secondary">Secondary</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Secondary");
	});

	it("should render with ghost variant", () => {
		const { container } = render(<Button variant="ghost">Ghost</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Ghost");
	});

	it("should render with link variant", () => {
		const { container } = render(<Button variant="link">Link</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Link");
	});

	it("should render with default size", () => {
		const { container } = render(<Button>Default Size</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Default Size");
	});

	it("should render with sm size", () => {
		const { container } = render(<Button size="sm">Small</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Small");
	});

	it("should render with lg size", () => {
		const { container } = render(<Button size="lg">Large</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Large");
	});

	it("should render with icon size", () => {
		const { container } = render(<Button size="icon">X</Button>);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("X");
	});

	it("should apply custom className", () => {
		const { container } = render(<Button className="custom-class">Custom</Button>);
		const button = container.querySelector("button");
		expect(button?.className).toContain("custom-class");
	});

	it("should pass through additional props", () => {
		const { container } = render(<Button data-testid="test-button">Props</Button>);
		const button = container.querySelector("button");
		expect(button?.getAttribute("data-testid")).toBe("test-button");
	});

	it("should handle onClick events", () => {
		const onClick = vi.fn();
		const { container } = render(<Button onClick={onClick}>Click Me</Button>);
		const button = container.querySelector("button");
		button?.click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("should support disabled state", () => {
		const { container } = render(<Button disabled>Disabled</Button>);
		const button = container.querySelector("button");
		expect(button?.disabled).toBe(true);
	});

	it("should combine variant and size", () => {
		const { container } = render(
			<Button variant="outline" size="lg">
				Combined
			</Button>,
		);
		const button = container.querySelector("button");
		expect(button).toBeDefined();
		expect(button?.textContent).toBe("Combined");
	});

	it("should support type attribute", () => {
		const { container } = render(<Button type="submit">Submit</Button>);
		const button = container.querySelector("button");
		expect(button?.type).toBe("submit");
	});

	it("should render as child element when asChild is true", () => {
		const { container } = render(
			<Button asChild>
				<a href="/test">Link Button</a>
			</Button>,
		);
		const link = container.querySelector("a");
		expect(link).toBeDefined();
		expect(link?.href).toContain("/test");
		expect(link?.textContent).toBe("Link Button");
	});

	it("should support ref forwarding", () => {
		let buttonRef: HTMLButtonElement | null = null;
		render(
			<Button
				ref={el => {
					buttonRef = el as HTMLButtonElement | null;
				}}
			>
				Ref Test
			</Button>,
		);
		expect(buttonRef).toBeDefined();
		expect(buttonRef).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: Test verifies ref is not null above
		expect(buttonRef!.tagName).toBe("BUTTON");
		// biome-ignore lint/style/noNonNullAssertion: Test verifies ref is not null above
		expect(buttonRef!.textContent).toBe("Ref Test");
	});

	it("should combine all props with asChild", () => {
		const onClick = vi.fn();
		const { container } = render(
			<Button asChild variant="outline" size="sm" onClick={onClick}>
				<a href="/combined">Combined Props</a>
			</Button>,
		);
		const link = container.querySelector("a");
		expect(link).toBeDefined();
		expect(link?.textContent).toBe("Combined Props");
		link?.click();
		expect(onClick).toHaveBeenCalledTimes(1);
	});
});
