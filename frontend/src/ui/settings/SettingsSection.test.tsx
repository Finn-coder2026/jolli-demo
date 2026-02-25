import { SettingsRow, SettingsSection } from "./SettingsSection";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("SettingsSection", () => {
	it("should render with title", () => {
		render(
			<SettingsSection title="Test Section">
				<div>Content</div>
			</SettingsSection>,
		);

		expect(screen.getByText("Test Section")).toBeDefined();
		expect(screen.getByText("Content")).toBeDefined();
	});

	it("should render with title and description", () => {
		render(
			<SettingsSection title="Test Section" description="Test description">
				<div>Content</div>
			</SettingsSection>,
		);

		expect(screen.getByText("Test Section")).toBeDefined();
		expect(screen.getByText("Test description")).toBeDefined();
		expect(screen.getByText("Content")).toBeDefined();
	});

	it("should render without description when not provided", () => {
		render(
			<SettingsSection title="Test Section">
				<div>Content</div>
			</SettingsSection>,
		);

		expect(screen.getByText("Test Section")).toBeDefined();
		expect(screen.getByText("Content")).toBeDefined();
	});

	it("should render children", () => {
		render(
			<SettingsSection title="Test Section">
				<div>Child 1</div>
				<div>Child 2</div>
			</SettingsSection>,
		);

		expect(screen.getByText("Child 1")).toBeDefined();
		expect(screen.getByText("Child 2")).toBeDefined();
	});
});

describe("SettingsRow", () => {
	it("should render with label", () => {
		render(
			<SettingsRow label="Test Label">
				<button type="button">Action</button>
			</SettingsRow>,
		);

		expect(screen.getByText("Test Label")).toBeDefined();
		expect(screen.getByRole("button", { name: "Action" })).toBeDefined();
	});

	it("should render with label and description", () => {
		render(
			<SettingsRow label="Test Label" description="Test description">
				<button type="button">Action</button>
			</SettingsRow>,
		);

		expect(screen.getByText("Test Label")).toBeDefined();
		expect(screen.getByText("Test description")).toBeDefined();
		expect(screen.getByRole("button", { name: "Action" })).toBeDefined();
	});

	it("should render without description when not provided", () => {
		render(
			<SettingsRow label="Test Label">
				<button type="button">Action</button>
			</SettingsRow>,
		);

		expect(screen.getByText("Test Label")).toBeDefined();
		expect(screen.getByRole("button", { name: "Action" })).toBeDefined();
	});

	it("should render children in action area", () => {
		render(
			<SettingsRow label="Test Label">
				<input type="checkbox" />
			</SettingsRow>,
		);

		expect(screen.getByRole("checkbox")).toBeDefined();
	});
});
