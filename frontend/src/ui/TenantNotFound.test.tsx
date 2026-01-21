import { TenantNotFound } from "./TenantNotFound";
import { render } from "@testing-library/preact";
import { beforeEach, describe, expect, it } from "vitest";

describe("TenantNotFound", () => {
	let originalHostname: PropertyDescriptor | undefined;

	beforeEach(() => {
		// Save original location.hostname descriptor
		originalHostname = Object.getOwnPropertyDescriptor(window, "location");
	});

	afterEach(() => {
		// Restore original location
		if (originalHostname) {
			Object.defineProperty(window, "location", originalHostname);
		}
	});

	it("should render page title", () => {
		const { container } = render(<TenantNotFound />);

		expect(container.textContent).toContain("Page Not Found");
	});

	it("should show generic message when no error is provided", () => {
		const { container } = render(<TenantNotFound />);

		expect(container.textContent).toContain("We couldn't find what you're looking for");
	});

	it("should show not found message when error is not_found", () => {
		const { container } = render(<TenantNotFound error="not_found" />);

		expect(container.textContent).toContain("doesn't exist or has been removed");
	});

	it("should show inactive message when error is inactive", () => {
		const { container } = render(<TenantNotFound error="inactive" />);

		expect(container.textContent).toContain("currently inactive");
		expect(container.textContent).toContain("contact your administrator");
	});

	it("should display error code when error is provided", () => {
		const { container } = render(<TenantNotFound error="not_found" />);

		expect(container.textContent).toContain("Error: not_found");
	});

	it("should not display error code when no error is provided", () => {
		const { container } = render(<TenantNotFound />);

		expect(container.textContent).not.toContain("Error:");
	});

	it("should have a link to go to main site", () => {
		const { container } = render(<TenantNotFound />);

		const link = container.querySelector("a");
		expect(link).toBeDefined();
		expect(link?.textContent).toContain("Go to main site");
	});

	it("should calculate main site URL by stripping subdomain", () => {
		// Mock window.location
		Object.defineProperty(window, "location", {
			value: {
				hostname: "tenant.example.com",
				protocol: "https:",
				origin: "https://tenant.example.com",
			},
			writable: true,
		});

		const { container } = render(<TenantNotFound />);

		const link = container.querySelector("a");
		expect(link?.getAttribute("href")).toBe("https://example.com");
	});

	it("should return current origin when hostname has only two parts", () => {
		Object.defineProperty(window, "location", {
			value: {
				hostname: "example.com",
				protocol: "https:",
				origin: "https://example.com",
			},
			writable: true,
		});

		const { container } = render(<TenantNotFound />);

		const link = container.querySelector("a");
		expect(link?.getAttribute("href")).toBe("https://example.com");
	});

	it("should handle deep subdomain nesting", () => {
		Object.defineProperty(window, "location", {
			value: {
				hostname: "org.tenant.jolli.app",
				protocol: "https:",
				origin: "https://org.tenant.jolli.app",
			},
			writable: true,
		});

		const { container } = render(<TenantNotFound />);

		const link = container.querySelector("a");
		expect(link?.getAttribute("href")).toBe("https://tenant.jolli.app");
	});
});
