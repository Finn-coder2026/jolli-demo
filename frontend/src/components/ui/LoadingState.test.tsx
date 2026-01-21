import { LoadingState } from "./LoadingState";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";

describe("LoadingState", () => {
	beforeEach(() => {
		// The global smart mock in Vitest.tsx handles useIntlayer automatically
	});

	it("should render default loading message", () => {
		render(<LoadingState />);

		expect(screen.getByText("Loading...")).toBeDefined();
	});

	it("should render custom message when provided", () => {
		render(<LoadingState message="Please wait..." />);

		expect(screen.getByText("Please wait...")).toBeDefined();
	});

	it("should use internationalized loading message when no custom message provided", () => {
		// The global smart mock in Vitest.tsx provides English content by default
		// This test verifies the component uses the intlayer content correctly

		render(<LoadingState />);

		expect(screen.getByText("Loading...")).toBeDefined();
	});
});
