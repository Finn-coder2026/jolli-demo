import { createMockIntlayerValue } from "../../test/TestUtils";
import { LandingPage } from "./LandingPage";
import { fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		signIn: "Sign In",
		enterApp: "Enter App",
		comingSoonAlt: createMockIntlayerValue("Coming Soon"),
	}),
}));

describe("LandingPage", () => {
	const originalLocation = window.location;

	beforeEach(() => {
		delete (window as { location?: Location }).location;
		(window as { location: Location }).location = { ...originalLocation, href: "" } as Location;
	});

	afterEach(() => {
		(window as { location: Location }).location = originalLocation;
	});

	it("should render header with logo and sign in button", () => {
		render(<LandingPage />);

		expect(screen.getByText("Jolli")).toBeDefined();
		expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
	});

	it("should render the coming soon image", () => {
		render(<LandingPage />);

		const image = screen.getByTestId("coming-soon-image");
		expect(image).toBeDefined();
		expect(image.getAttribute("alt")).toBe("Coming Soon");
		expect(image.getAttribute("src")).toBe("/assets/jolli-coming-soon.avif");
	});

	it("should fallback to png when image loading fails", () => {
		render(<LandingPage />);

		const image = screen.getByTestId("coming-soon-image");
		fireEvent.error(image);
		expect(image.getAttribute("src")).toBe("/assets/jolli-coming-soon.png");
	});

	it("should navigate to local login when Sign In button is clicked and no authGatewayOrigin", () => {
		render(<LandingPage />);

		const signInButton = screen.getByRole("button", { name: /sign in/i });
		signInButton.click();

		expect(window.location.href).toBe("/login");
	});

	it("should navigate to auth gateway when Sign In button is clicked with authGatewayOrigin", () => {
		render(<LandingPage authGatewayOrigin="https://auth.example.com" />);

		const signInButton = screen.getByRole("button", { name: /sign in/i });
		signInButton.click();

		expect(window.location.href).toBe("https://auth.example.com/login");
	});

	it("should show Enter App button when user is logged in", () => {
		render(<LandingPage isLoggedIn={true} />);

		expect(screen.getByRole("button", { name: /enter app/i })).toBeDefined();
		expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
	});

	it("should navigate to dashboard when Enter App button is clicked", () => {
		render(<LandingPage isLoggedIn={true} />);

		const enterAppButton = screen.getByRole("button", { name: /enter app/i });
		enterAppButton.click();

		expect(window.location.href).toBe("/dashboard");
	});

	it("should call onEnterApp callback when provided", () => {
		const onEnterApp = vi.fn();
		render(<LandingPage isLoggedIn={true} onEnterApp={onEnterApp} />);

		const enterAppButton = screen.getByRole("button", { name: /enter app/i });
		enterAppButton.click();

		expect(onEnterApp).toHaveBeenCalledOnce();
		// Should not set window.location.href when callback is provided
		expect(window.location.href).toBe("");
	});
});
