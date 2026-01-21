import { AppBranding } from "./AppBranding";
import { render } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("AppBranding", () => {
	it("should render with default props (centered variant)", () => {
		const { container } = render(<AppBranding />);
		expect(container.textContent).toContain("Jolli");
		expect(container.textContent).toContain("Documentation Intelligence");
	});

	it("should render centered variant with showText true", () => {
		const { container } = render(<AppBranding variant="centered" showText={true} />);
		expect(container.textContent).toContain("Jolli");
		expect(container.textContent).toContain("Documentation Intelligence");
	});

	it("should render centered variant with showText false", () => {
		const { container } = render(<AppBranding variant="centered" showText={false} />);
		expect(container.textContent).not.toContain("Jolli");
		expect(container.textContent).not.toContain("Documentation Intelligence");
	});

	it("should render sidebar variant with showText true", () => {
		const { container } = render(<AppBranding variant="sidebar" showText={true} />);
		expect(container.textContent).toContain("Jolli");
		expect(container.textContent).toContain("Documentation Intelligence");
	});

	it("should render sidebar variant with showText false", () => {
		const { container } = render(<AppBranding variant="sidebar" showText={false} />);
		expect(container.textContent).not.toContain("Jolli");
		expect(container.textContent).not.toContain("Documentation Intelligence");
	});

	it("should render sidebar variant with animate true", () => {
		const { container } = render(<AppBranding variant="sidebar" animate={true} />);
		const animatedDiv = container.querySelector(".animate-in");
		expect(animatedDiv).toBeDefined();
		expect(container.textContent).toContain("Jolli");
	});

	it("should render sidebar variant with animate false", () => {
		const { container } = render(<AppBranding variant="sidebar" animate={false} />);
		const animatedDiv = container.querySelector(".animate-in");
		expect(animatedDiv).toBeNull();
		expect(container.textContent).toContain("Jolli");
	});

	it("should render centered variant without animate prop", () => {
		const { container } = render(<AppBranding variant="centered" />);
		expect(container.textContent).toContain("Jolli");
	});

	it("should render sidebar variant with all props", () => {
		const { container } = render(<AppBranding variant="sidebar" showText={true} animate={true} />);
		expect(container.textContent).toContain("Jolli");
		const animatedDiv = container.querySelector(".animate-in");
		expect(animatedDiv).toBeDefined();
	});

	it("should render emoji icon for centered variant", () => {
		const { container } = render(<AppBranding variant="centered" />);
		expect(container.textContent).toContain("📄");
	});

	it("should render emoji icon for sidebar variant", () => {
		const { container } = render(<AppBranding variant="sidebar" />);
		expect(container.textContent).toContain("📄");
	});

	it("should have correct structure for centered variant", () => {
		const { container } = render(<AppBranding variant="centered" />);
		const centerDiv = container.querySelector(".text-center");
		expect(centerDiv).toBeDefined();
	});

	it("should have correct structure for sidebar variant", () => {
		const { container } = render(<AppBranding variant="sidebar" />);
		const sidebarDiv = container.querySelector(".border-b");
		expect(sidebarDiv).toBeDefined();
	});

	it("should apply animate class only when showText is true and animate is true", () => {
		const { container } = render(<AppBranding variant="sidebar" showText={true} animate={true} />);
		const animatedDiv = container.querySelector(".animate-in");
		expect(animatedDiv).toBeDefined();
	});

	it("should not apply animate class when showText is false", () => {
		const { container } = render(<AppBranding variant="sidebar" showText={false} animate={true} />);
		const animatedDiv = container.querySelector(".animate-in");
		expect(animatedDiv).toBeNull();
	});
});
