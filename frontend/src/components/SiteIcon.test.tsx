import { getSiteColor } from "../util/ColorUtils";
import { SiteIcon } from "./SiteIcon";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../util/ColorUtils", () => ({
	getSiteColor: vi.fn(),
}));

const mockedGetSiteColor = vi.mocked(getSiteColor);

describe("SiteIcon", () => {
	beforeEach(() => {
		mockedGetSiteColor.mockReturnValue("bg-blue-500");
	});

	it("should render with first letter of name uppercased", () => {
		render(<SiteIcon name="acme" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.textContent).toBe("A");
	});

	it("should apply default size 5 classes", () => {
		render(<SiteIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("h-5");
		expect(icon.className).toContain("w-5");
		expect(icon.className).toContain("text-xs");
	});

	it("should apply size 6 classes when specified", () => {
		render(<SiteIcon name="Test" size={6} data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("h-6");
		expect(icon.className).toContain("w-6");
		expect(icon.className).toContain("text-sm");
	});

	it("should apply size 8 classes when specified", () => {
		render(<SiteIcon name="Test" size={8} data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("h-8");
		expect(icon.className).toContain("w-8");
		expect(icon.className).toContain("text-sm");
	});

	it("should pass data-testid to the rendered element", () => {
		render(<SiteIcon name="Test" data-testid="my-site-icon" />);
		const icon = screen.getByTestId("my-site-icon");
		expect(icon).toBeDefined();
	});

	it("should apply a custom className", () => {
		render(<SiteIcon name="Test" className="custom-class" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("custom-class");
	});

	it("should call getSiteColor with the site name and apply the returned class", () => {
		render(<SiteIcon name="My Site" data-testid="icon" />);
		expect(mockedGetSiteColor).toHaveBeenCalledWith("My Site");
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("bg-blue-500");
	});

	it("should include base layout classes", () => {
		render(<SiteIcon name="Test" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.className).toContain("rounded");
		expect(icon.className).toContain("flex");
		expect(icon.className).toContain("items-center");
		expect(icon.className).toContain("justify-center");
		expect(icon.className).toContain("text-white");
		expect(icon.className).toContain("font-semibold");
		expect(icon.className).toContain("flex-shrink-0");
	});

	it("should handle an empty name gracefully", () => {
		render(<SiteIcon name="" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon).toBeDefined();
		expect(icon.textContent).toBe("");
	});

	it("should uppercase a lowercase first character", () => {
		render(<SiteIcon name="zebra" data-testid="icon" />);
		const icon = screen.getByTestId("icon");
		expect(icon.textContent).toBe("Z");
	});
});
