import { Textarea } from "./Textarea";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("Textarea", () => {
	it("should render textarea", () => {
		const { container } = render(<Textarea />);
		const textarea = container.querySelector("textarea");
		expect(textarea).toBeDefined();
	});

	it("should apply custom className", () => {
		const { container } = render(<Textarea className="custom-class" />);
		const textarea = container.querySelector("textarea");
		expect(textarea?.className).toContain("custom-class");
	});

	it("should pass through props", () => {
		const { container } = render(<Textarea placeholder="Enter text" />);
		const textarea = container.querySelector("textarea");
		expect(textarea?.placeholder).toBe("Enter text");
	});

	it("should pass through disabled prop", () => {
		const { container } = render(<Textarea disabled />);
		const textarea = container.querySelector("textarea");
		expect(textarea?.disabled).toBe(true);
	});

	it("should pass through value prop", () => {
		const { container } = render(
			<Textarea
				value="test value"
				onChange={() => {
					// Handler for controlled component
				}}
			/>,
		);
		const textarea = container.querySelector("textarea");
		expect(textarea?.value).toBe("test value");
	});
});
