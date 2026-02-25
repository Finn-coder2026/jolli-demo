import { ContentShell } from "./ContentShell";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("ContentShell", () => {
	it("should render children", () => {
		const { getByText } = render(<ContentShell>Hello</ContentShell>);
		expect(getByText("Hello")).toBeDefined();
	});

	it("should apply base shell classes", () => {
		const { container } = render(<ContentShell>Content</ContentShell>);
		const el = container.firstElementChild as HTMLElement;
		expect(el.className).toContain("bg-sidebar");
		expect(el.className).toContain("py-1.5");
		expect(el.className).toContain("pr-1.5");
		expect(el.className).toContain("h-full");
	});

	it("should merge additional className", () => {
		const { container } = render(<ContentShell className="extra-class">Content</ContentShell>);
		const el = container.firstElementChild as HTMLElement;
		expect(el.className).toContain("extra-class");
		expect(el.className).toContain("bg-sidebar");
	});

	it("should forward data-testid", () => {
		const { getByTestId } = render(<ContentShell data-testid="my-shell">Content</ContentShell>);
		expect(getByTestId("my-shell")).toBeDefined();
	});
});
