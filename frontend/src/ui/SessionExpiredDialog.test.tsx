import { SessionExpiredDialog } from "./SessionExpiredDialog";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		title: "Session Expired",
		message: "Your session has expired due to inactivity. Please log in again to continue.",
		loginButton: "Log In Again",
	}),
}));

describe("SessionExpiredDialog", () => {
	it("should not render when isOpen is false", () => {
		const onReLogin = vi.fn();
		render(<SessionExpiredDialog isOpen={false} onReLogin={onReLogin} />);

		expect(screen.queryByTestId("session-expired-dialog")).toBe(null);
	});

	it("should render dialog when isOpen is true", () => {
		const onReLogin = vi.fn();
		render(<SessionExpiredDialog isOpen={true} onReLogin={onReLogin} />);

		expect(screen.getByTestId("session-expired-dialog")).toBeDefined();
		expect(screen.getByTestId("session-expired-title")).toBeDefined();
		expect(screen.getByTestId("session-expired-message")).toBeDefined();
		expect(screen.getByTestId("session-expired-login-button")).toBeDefined();
	});

	it("should display correct content", () => {
		const onReLogin = vi.fn();
		render(<SessionExpiredDialog isOpen={true} onReLogin={onReLogin} />);

		expect(screen.getByTestId("session-expired-title").textContent).toBe("Session Expired");
		expect(screen.getByTestId("session-expired-message").textContent).toContain(
			"Your session has expired due to inactivity",
		);
		expect(screen.getByTestId("session-expired-login-button").textContent).toBe("Log In Again");
	});

	it("should call onReLogin when button is clicked", () => {
		const onReLogin = vi.fn();
		render(<SessionExpiredDialog isOpen={true} onReLogin={onReLogin} />);

		fireEvent.click(screen.getByTestId("session-expired-login-button"));

		expect(onReLogin).toHaveBeenCalledTimes(1);
	});

	it("should call onReLogin when backdrop is clicked", () => {
		const onReLogin = vi.fn();
		render(<SessionExpiredDialog isOpen={true} onReLogin={onReLogin} />);

		// Click on the backdrop (outer div)
		fireEvent.click(screen.getByTestId("session-expired-dialog"));

		expect(onReLogin).toHaveBeenCalledTimes(1);
	});

	it("should not call onReLogin when inner dialog is clicked", () => {
		const onReLogin = vi.fn();
		render(<SessionExpiredDialog isOpen={true} onReLogin={onReLogin} />);

		// Click on the inner dialog content (not the backdrop)
		const title = screen.getByTestId("session-expired-title");
		fireEvent.click(title);

		expect(onReLogin).not.toHaveBeenCalled();
	});
});
