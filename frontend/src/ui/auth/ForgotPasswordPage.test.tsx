import { ForgotPasswordPage } from "./ForgotPasswordPage";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch
global.fetch = vi.fn();

describe("ForgotPasswordPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render forgot password form", () => {
		render(<ForgotPasswordPage />);

		expect(screen.getByText("Forgot Password")).toBeDefined();
		expect(screen.getByText("Enter your email to receive a password reset link.")).toBeDefined();
		expect(screen.getByPlaceholderText("Email")).toBeDefined();
		expect(screen.getByRole("button", { name: "Next" })).toBeDefined();
	});

	it("should submit form with valid email", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

		render(<ForgotPasswordPage />);

		const emailInput = screen.getByPlaceholderText("Email");
		fireEvent.input(emailInput, { target: { value: "test@example.com" } });

		const submitButton = screen.getByRole("button", { name: "Next" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith(
				`${window.location.origin}/auth/request-password-reset`,
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						email: "test@example.com",
						redirectTo: `${window.location.origin}/reset-password`,
					}),
					credentials: "include",
				}),
			);
		});
	});

	it("should show success message after successful submission", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

		render(<ForgotPasswordPage />);

		const emailInput = screen.getByPlaceholderText("Email");
		fireEvent.input(emailInput, { target: { value: "test@example.com" } });

		const submitButton = screen.getByRole("button", { name: "Next" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Check Your Email")).toBeDefined();
		});
	});

	it("should show error message when submission fails", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

		render(<ForgotPasswordPage />);

		const emailInput = screen.getByPlaceholderText("Email");
		fireEvent.input(emailInput, { target: { value: "test@example.com" } });

		const submitButton = screen.getByRole("button", { name: "Next" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to send reset email. Please try again.")).toBeDefined();
		});
	});

	it("should have back to login link", () => {
		render(<ForgotPasswordPage />);

		const backLinks = screen.getAllByText("Back to Login");
		expect(backLinks.length).toBeGreaterThan(0);
	});
});
