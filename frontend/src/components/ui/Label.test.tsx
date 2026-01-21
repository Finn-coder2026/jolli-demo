import { Label } from "./Label";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("Label", () => {
	it("should render label with text", () => {
		render(<Label data-testid="label">Username</Label>);

		expect(screen.getByTestId("label")).toBeDefined();
		expect(screen.getByText("Username")).toBeDefined();
	});

	it("should render label with custom className", () => {
		render(
			<Label className="custom-label" data-testid="custom-label">
				Email
			</Label>,
		);

		const label = screen.getByTestId("custom-label");
		expect(label.className).toContain("custom-label");
	});

	it("should render label with htmlFor attribute", () => {
		render(
			<Label htmlFor="username" data-testid="username-label">
				Username
			</Label>,
		);

		const label = screen.getByTestId("username-label") as HTMLLabelElement;
		expect(label).toBeDefined();
		expect(label.getAttribute("for")).toBe("username");
	});

	it("should render label with children", () => {
		render(
			<Label data-testid="label-with-children">
				<span>First Name</span>
				<span className="text-red-500">*</span>
			</Label>,
		);

		expect(screen.getByTestId("label-with-children")).toBeDefined();
		expect(screen.getByText("First Name")).toBeDefined();
		expect(screen.getByText("*")).toBeDefined();
	});
});
