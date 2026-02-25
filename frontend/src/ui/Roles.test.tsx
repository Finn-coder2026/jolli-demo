/**
 * Tests for the Roles page component.
 */

import { Roles } from "./Roles";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock the settings Roles component to avoid needing full client context
vi.mock("./settings/Roles", () => ({
	Roles: () => <div data-testid="roles-content">Roles Content</div>,
}));

describe("Roles", () => {
	it("should render page title", () => {
		render(<Roles />);

		expect(screen.getByText("Roles")).toBeDefined();
	});

	it("should render subtitle", () => {
		render(<Roles />);

		expect(screen.getByText("Manage roles and permissions for your organization")).toBeDefined();
	});

	it("should render the RolesContent component", () => {
		render(<Roles />);

		expect(screen.getByTestId("roles-content")).toBeDefined();
	});
});
