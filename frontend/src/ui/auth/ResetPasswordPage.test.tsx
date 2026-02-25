import { ResetPasswordPage } from "./ResetPasswordPage";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ResetPasswordPage", () => {
	const originalLocation = window.location;
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		// Mock window.location
		delete (window as { location?: Location }).location;
		(window as { location: Location }).location = {
			...originalLocation,
			search: "?token=valid-token-123",
			origin: "http://localhost",
		} as Location;

		// Mock fetch by default to return valid token
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: true }),
		});
	});

	afterEach(() => {
		(window as { location: Location }).location = originalLocation;
		global.fetch = originalFetch;
	});

	it("should render reset password form with valid token", async () => {
		render(<ResetPasswordPage />);

		// Wait for token validation to complete
		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		// Check for unique text and form elements
		expect(screen.getByText("Enter your new password below.")).toBeDefined();
		expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		expect(screen.getByPlaceholderText("Confirm Password")).toBeDefined();
		expect(screen.getByRole("button", { name: "Reset Password" })).toBeDefined();
	});

	it("should show validating message initially", () => {
		render(<ResetPasswordPage />);

		expect(screen.getByText("Validating reset link...")).toBeDefined();
	});

	it("should show error when token is invalid", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: false, error: "invalid_token" }),
		});

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByText("This reset link is invalid. Please request a new password reset.")).toBeDefined();
		});

		// Should show link to request new reset
		expect(screen.getByText("Request New Reset Link")).toBeDefined();
	});

	it("should show error when token is expired", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: false, error: "expired_token" }),
		});

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByText("This reset link has expired. Please request a new password reset.")).toBeDefined();
		});
	});

	it("should show error when token is already used", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: false, error: "used_token" }),
		});

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(
				screen.getByText("This reset link has already been used. Please request a new password reset."),
			).toBeDefined();
		});
	});

	it("should show error when token validation fetch throws", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByText("Failed to validate reset link. Please try again later.")).toBeDefined();
		});
	});

	it("should show error when passwords do not match", async () => {
		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const newPasswordInput = screen.getByPlaceholderText("New Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(newPasswordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "DifferentPass123!" } });

		const submitButton = screen.getByRole("button", { name: "Reset Password" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Passwords do not match")).toBeDefined();
		});

		// Validation endpoint should be called, but reset endpoint should not
		expect(global.fetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/auth/legacy/password/validate-reset-token"),
		);
		expect(global.fetch).not.toHaveBeenCalledWith(
			expect.stringContaining("/api/auth/legacy/password/reset-password"),
			expect.anything(),
		);
	});

	it("should show error when password is too short", async () => {
		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const newPasswordInput = screen.getByPlaceholderText("New Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(newPasswordInput, { target: { value: "Short1!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "Short1!" } });

		const submitButton = screen.getByRole("button", { name: "Reset Password" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Password must be at least 8 characters")).toBeDefined();
		});
	});

	it("should show error when password lacks uppercase letter", async () => {
		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const newPasswordInput = screen.getByPlaceholderText("New Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(newPasswordInput, { target: { value: "lowercase123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "lowercase123!" } });

		const submitButton = screen.getByRole("button", { name: "Reset Password" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Password must contain at least one uppercase letter")).toBeDefined();
		});
	});

	it("should submit form with valid password", async () => {
		// Mock reset password endpoint success
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				// First call: token validation
				ok: true,
				json: async () => ({ valid: true }),
			})
			.mockResolvedValueOnce({
				// Second call: password reset
				ok: true,
				json: async () => ({ success: true }),
			});

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const newPasswordInput = screen.getByPlaceholderText("New Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(newPasswordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByRole("button", { name: "Reset Password" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			// Check that fetch was called with reset password endpoint
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/auth/legacy/password/reset-password"),
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({ "Content-Type": "application/json" }),
					body: expect.stringContaining("ValidPass123!"),
				}),
			);
		});
	});

	it("should show success message after successful password reset", async () => {
		// Mock reset password endpoint success
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				// First call: token validation
				ok: true,
				json: async () => ({ valid: true }),
			})
			.mockResolvedValueOnce({
				// Second call: password reset
				ok: true,
				json: async () => ({ success: true }),
			});

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const newPasswordInput = screen.getByPlaceholderText("New Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(newPasswordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByRole("button", { name: "Reset Password" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Password Reset Successful!")).toBeDefined();
		});
	});

	it("should show error message when password is reused", async () => {
		// Mock reset password endpoint with password_reused error
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				// First call: token validation
				ok: true,
				json: async () => ({ valid: true }),
			})
			.mockResolvedValueOnce({
				// Second call: password reset with reused error
				ok: true,
				json: async () => ({
					success: false,
					error: "password_reused",
					message: "This password was used recently. Please choose a different password.",
				}),
			});

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const newPasswordInput = screen.getByPlaceholderText("New Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(newPasswordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByRole("button", { name: "Reset Password" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(
				screen.getByText("This password was used recently. Please choose a different password."),
			).toBeDefined();
		});
	});

	it("should show generic error message for other errors", async () => {
		// Mock reset password endpoint with generic error
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				// First call: token validation
				ok: true,
				json: async () => ({ valid: true }),
			})
			.mockResolvedValueOnce({
				// Second call: password reset with generic error
				ok: true,
				json: async () => ({
					success: false,
					error: "server_error",
					message: "Something went wrong",
				}),
			});

		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const newPasswordInput = screen.getByPlaceholderText("New Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(newPasswordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByRole("button", { name: "Reset Password" });
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText("Something went wrong")).toBeDefined();
		});
	});

	it("should have back to login link when form is shown", async () => {
		render(<ResetPasswordPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("New Password")).toBeDefined();
		});

		const backLinks = screen.getAllByText("Back to Login");
		expect(backLinks.length).toBeGreaterThan(0);
	});
});
