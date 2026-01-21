import { Badge } from "./Badge";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("Badge", () => {
	it("should render with default variant", () => {
		const { container } = render(<Badge>Default</Badge>);
		const badge = container.querySelector("div");
		expect(badge).toBeDefined();
		expect(badge?.textContent).toBe("Default");
	});

	it("should render with secondary variant", () => {
		const { container } = render(<Badge variant="secondary">Secondary</Badge>);
		const badge = container.querySelector("div");
		expect(badge).toBeDefined();
		expect(badge?.textContent).toBe("Secondary");
	});

	it("should render with destructive variant", () => {
		const { container } = render(<Badge variant="destructive">Destructive</Badge>);
		const badge = container.querySelector("div");
		expect(badge).toBeDefined();
		expect(badge?.textContent).toBe("Destructive");
	});

	it("should render with outline variant", () => {
		const { container } = render(<Badge variant="outline">Outline</Badge>);
		const badge = container.querySelector("div");
		expect(badge).toBeDefined();
		expect(badge?.textContent).toBe("Outline");
	});

	it("should apply custom className", () => {
		const { container } = render(<Badge className="custom-class">Custom</Badge>);
		const badge = container.querySelector("div");
		expect(badge?.className).toContain("custom-class");
	});

	it("should pass through additional props", () => {
		const { container } = render(<Badge data-testid="test-badge">Props</Badge>);
		const badge = container.querySelector("div");
		expect(badge?.getAttribute("data-testid")).toBe("test-badge");
	});
});
