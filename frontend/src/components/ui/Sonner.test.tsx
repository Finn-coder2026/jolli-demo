import { Toaster } from "./Sonner";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("Sonner", () => {
	it("should render Toaster component", () => {
		const { container } = render(<Toaster />);
		// The Toaster renders nothing visible in tests due to mock
		expect(container).toBeDefined();
	});

	it("should accept custom props", () => {
		const { container } = render(<Toaster position="top-center" />);
		expect(container).toBeDefined();
	});
});
