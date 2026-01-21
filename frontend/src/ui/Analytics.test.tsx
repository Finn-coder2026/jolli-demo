import { Analytics } from "./Analytics";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";

describe("Analytics", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render analytics heading", () => {
		render(<Analytics />);

		expect(screen.getByText("Analytics")).toBeDefined();
	});

	it("should render subtitle", () => {
		render(<Analytics />);

		expect(screen.getByText("View your documentation analytics")).toBeDefined();
	});
});
