import { FloatingPanel } from "./FloatingPanel";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("FloatingPanel", () => {
	it("should render children", () => {
		const { getByText } = render(<FloatingPanel>Hello</FloatingPanel>);
		expect(getByText("Hello")).toBeDefined();
	});

	it("should apply base panel classes", () => {
		const { container } = render(<FloatingPanel>Content</FloatingPanel>);
		const el = container.firstElementChild as HTMLElement;
		expect(el.className).toContain("bg-background");
		expect(el.className).toContain("rounded-lg");
		expect(el.className).toContain("border-border");
		expect(el.className).toContain("shadow-sm");
	});

	it("should merge additional className", () => {
		const { container } = render(<FloatingPanel className="h-full overflow-hidden">Content</FloatingPanel>);
		const el = container.firstElementChild as HTMLElement;
		expect(el.className).toContain("h-full");
		expect(el.className).toContain("overflow-hidden");
		expect(el.className).toContain("bg-background");
	});

	it("should forward data-testid", () => {
		const { getByTestId } = render(<FloatingPanel data-testid="my-panel">Content</FloatingPanel>);
		expect(getByTestId("my-panel")).toBeDefined();
	});
});
