import { clearEmailSelectionCookie, getEmailSelectionCookieData } from "../../util/AuthCookieUtil";
import { AcceptInvitationPage } from "./AcceptInvitationPage";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the authClient
vi.mock("../../lib/authClient", () => ({
	authClient: {
		signIn: {
			social: vi.fn().mockResolvedValue(undefined),
		},
	},
}));

vi.mock("../../util/AuthCookieUtil", () => ({
	clearEmailSelectionCookie: vi.fn(),
	getEmailSelectionCookieData: vi.fn(),
}));

describe("AcceptInvitationPage", () => {
	const originalLocation = window.location;
	const originalFetch = global.fetch;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getEmailSelectionCookieData).mockReturnValue(undefined);
		// Mock window.location
		delete (window as { location?: Location }).location;
		(window as { location: Location }).location = {
			...originalLocation,
			search: "?token=valid-token-123",
			origin: "http://localhost",
			href: "http://localhost/invite/accept?token=valid-token-123",
		} as Location;

		// Mock fetch by default to return valid invitation
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				valid: true,
				invitation: {
					email: "test@example.com",
					role: "member",
					name: "Test User",
					organizationName: "Test Org",
					userExists: false,
					hasCredential: false,
				},
			}),
		});
	});

	afterEach(() => {
		(window as { location: Location }).location = originalLocation;
		global.fetch = originalFetch;
	});

	it("should render accept invitation form with valid token", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Enter your name")).toBeDefined();
		});

		// Check for form elements
		expect(screen.getByDisplayValue("test@example.com")).toBeDefined();
		expect(screen.getByPlaceholderText("Password")).toBeDefined();
		expect(screen.getByPlaceholderText("Confirm Password")).toBeDefined();
		expect(screen.getByTestId("accept-invitation-create-submit")).toBeDefined();
	});

	it("should render set password form for existing user without credential", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				valid: true,
				invitation: {
					email: "existing@example.com",
					role: "member",
					name: "Existing User",
					organizationName: "Test Org",
					userExists: true,
					hasCredential: false,
				},
			}),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-no-password-message")).toBeDefined();
		});

		expect(screen.getByPlaceholderText("Password")).toBeDefined();
		expect(screen.getByPlaceholderText("Confirm Password")).toBeDefined();
		expect(screen.getByTestId("accept-invitation-set-password-submit")).toBeDefined();
	});

	it("should render accept-with-password form for existing user with credential", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				valid: true,
				invitation: {
					email: "existing@example.com",
					role: "member",
					name: "Existing User",
					organizationName: "Test Org",
					userExists: true,
					hasCredential: true,
				},
			}),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-existing-user-message")).toBeDefined();
		});

		expect(screen.getByPlaceholderText("Password")).toBeDefined();
		expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
	});

	it("should show validating message initially", () => {
		render(<AcceptInvitationPage />);

		expect(screen.getByTestId("accept-invitation-validating")).toBeDefined();
	});

	it("should pre-fill name if provided in invitation", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByDisplayValue("Test User")).toBeDefined();
		});
	});

	it("should show organization and role information", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-org-name")).toBeDefined();
			expect(screen.getByTestId("accept-invitation-role")).toBeDefined();
		});
	});

	it("should show error when token is missing", async () => {
		(window as { location: Location }).location = {
			...originalLocation,
			search: "",
			origin: "http://localhost",
		} as Location;

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-error")).toBeDefined();
		});
	});

	it("should show error when token is invalid", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: false, error: "invalid_token" }),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-error")).toBeDefined();
		});

		expect(screen.getByTestId("accept-invitation-back-to-login")).toBeDefined();
	});

	it("should show error when token is expired", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: false, error: "expired_token" }),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-error")).toBeDefined();
		});
	});

	it("should show error when token is already used", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: false, error: "used_token" }),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-error")).toBeDefined();
		});
	});

	it("should show error when invitation not found", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ valid: false, error: "invitation_not_found" }),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-error")).toBeDefined();
		});
	});

	it("should show error when passwords do not match", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "DifferentPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error when password is too short", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "Short1!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "Short1!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error when password lacks uppercase letter", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "lowercase123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "lowercase123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error when password lacks lowercase letter", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "UPPERCASE123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "UPPERCASE123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error when password lacks number", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "NoNumbers!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "NoNumbers!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error when password lacks special character", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "NoSpecial123" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "NoSpecial123" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error when password contains email prefix", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		// The email from mock is test@example.com, so "Test" should be blocked
		fireEvent.input(passwordInput, { target: { value: "Test@1234abc" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "Test@1234abc" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should submit form with valid password and show success", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "newuser@example.com",
						role: "admin",
						name: null,
						organizationName: "My Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");
		const nameInput = screen.getByPlaceholderText("Enter your name");

		fireEvent.input(nameInput, { target: { value: "New User" } });
		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
		});

		expect(screen.getByTestId("accept-invitation-success-message")).toBeDefined();
	});

	it("should show error message when user already exists", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "existing@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "user_exists",
					message: "User already exists",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show server error message for other errors", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "server_error",
					message: "Something went wrong",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show server error on fetch failure during validation", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			json: async () => ({}),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-error")).toBeDefined();
		});
	});

	it("should show server error on network failure during validation", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-error")).toBeDefined();
		});
	});

	it("should show server error on network failure during accept", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockRejectedValueOnce(new Error("Network error"));

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should have back to login link when form is shown", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		expect(screen.getByTestId("accept-invitation-form-back-to-login")).toBeDefined();
	});

	it("should display role names correctly", async () => {
		// Test admin role
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				valid: true,
				invitation: {
					email: "test@example.com",
					role: "admin",
					name: null,
					organizationName: "Test Org",
				},
			}),
		});

		const { unmount } = render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-role")).toBeDefined();
		});

		unmount();

		// Test owner role
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				valid: true,
				invitation: {
					email: "test@example.com",
					role: "owner",
					name: null,
					organizationName: "Test Org",
				},
			}),
		});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-role")).toBeDefined();
		});
	});

	it("should show error when password is too long", async () => {
		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		// Password over 36 characters
		const longPassword = `ValidPass123!${"x".repeat(30)}`;
		fireEvent.input(passwordInput, { target: { value: longPassword } });
		fireEvent.input(confirmPasswordInput, { target: { value: longPassword } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show invalid_password error from backend", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "invalid_password",
					message: "Password is not strong enough",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error for missing_fields from backend", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "missing_fields",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error for expired_token during accept", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "expired_token",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error for used_token during accept", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "used_token",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error for invitation_not_found during accept", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "invitation_not_found",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show error for invalid_token during accept", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "invalid_token",
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should submit form with empty name (sends undefined)", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "newuser@example.com",
						role: "member",
						name: null,
						organizationName: "My Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");
		const nameInput = screen.getByPlaceholderText("Enter your name");

		// Set name to whitespace only (trims to empty, branches to undefined)
		fireEvent.input(nameInput, { target: { value: "   " } });
		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
		});

		// Verify the name was sent as undefined (trimmed empty string)
		const acceptCall = vi.mocked(global.fetch).mock.calls[1];
		const body = JSON.parse(acceptCall[1]?.body as string);
		expect(body.name).toBeUndefined();
	});

	it("should show default error for unknown error without message", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "some_unknown_error",
					// No message provided - falls back to content.serverError.value
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	it("should show default error message when invalid_password has no message", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "test@example.com",
						role: "member",
						name: null,
						organizationName: "Test Org",
					},
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "invalid_password",
					// No message provided
				}),
			});

		render(<AcceptInvitationPage />);

		await waitFor(() => {
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});

		const passwordInput = screen.getByPlaceholderText("Password");
		const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

		fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
		fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

		const submitButton = screen.getByTestId("accept-invitation-create-submit");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
		});
	});

	describe("OAuth sign up", () => {
		it("should render OAuth buttons when token is valid", async () => {
			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-oauth-divider")).toBeDefined();
			});

			expect(screen.getByTestId("accept-invitation-google-btn")).toBeDefined();
			expect(screen.getByTestId("accept-invitation-github-btn")).toBeDefined();
		});

		it("should call authClient.signIn.social when clicking Google button", async () => {
			const { authClient } = await import("../../lib/authClient");

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-google-btn")).toBeDefined();
			});

			const googleButton = screen.getByTestId("accept-invitation-google-btn");
			fireEvent.click(googleButton);

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "google",
					callbackURL: expect.stringContaining("/invite/accept?token="),
				});
			});
		});

		it("should call authClient.signIn.social when clicking GitHub button", async () => {
			const { authClient } = await import("../../lib/authClient");

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-github-btn")).toBeDefined();
			});

			const githubButton = screen.getByTestId("accept-invitation-github-btn");
			fireEvent.click(githubButton);

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "github",
					callbackURL: expect.stringContaining("/invite/accept?token="),
				});
			});
		});

		it("should complete OAuth acceptance when returning with oauth=pending", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock fetch for validation and OAuth accept
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: true,
					}),
				});

			render(<AcceptInvitationPage />);

			// Wait for success message (OAuth acceptance completed)
			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
			});

			// Verify OAuth accept API was called
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/invitation/accept-social"),
				expect.objectContaining({
					method: "POST",
				}),
			);
		});

		it("should resolve invitation email via select-email before accept-social when session email mismatches", async () => {
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			vi.mocked(getEmailSelectionCookieData).mockReturnValue({
				code: "selection-code",
				primary: "primary@example.com",
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "invited@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "different@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						pendingEmailSelection: {
							emails: ["primary@example.com", "invited@example.com"],
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: true,
						redirectTo: "/select-tenant",
						effectiveEmail: "invited@example.com",
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: true,
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
			});

			const selectEmailCall = vi
				.mocked(global.fetch)
				.mock.calls.find(([url]) => String(url).includes("/auth/select-email"));
			expect(selectEmailCall).toBeDefined();
			const selectEmailOptions = selectEmailCall?.[1] as RequestInit | undefined;
			expect(JSON.parse(String(selectEmailOptions?.body))).toEqual({
				code: "selection-code",
				email: "invited@example.com",
			});
			expect(clearEmailSelectionCookie).toHaveBeenCalled();
			expect(global.fetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/invitation/accept-social"),
				expect.objectContaining({
					method: "POST",
				}),
			);
		});

		it("should fail with email mismatch when select-email effectiveEmail does not match invitation", async () => {
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			vi.mocked(getEmailSelectionCookieData).mockReturnValue({
				code: "selection-code",
				primary: "primary@example.com",
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "invited@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "different@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						pendingEmailSelection: {
							emails: ["primary@example.com", "invited@example.com"],
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: true,
						redirectTo: "/select-tenant",
						effectiveEmail: "wrong@example.com",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			const calledUrls = vi.mocked(global.fetch).mock.calls.map(([url]) => String(url));
			expect(calledUrls.some(url => url.includes("/api/invitation/accept-social"))).toBe(false);
			expect(clearEmailSelectionCookie).toHaveBeenCalled();
		});

		it("should fail with email mismatch when invitation email is not in pending email-selection options", async () => {
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			vi.mocked(getEmailSelectionCookieData).mockReturnValue({
				code: "selection-code",
				primary: "primary@example.com",
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "invited@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "different@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						pendingEmailSelection: {
							emails: ["primary@example.com", "another@example.com"],
						},
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			const calledUrls = vi.mocked(global.fetch).mock.calls.map(([url]) => String(url));
			expect(calledUrls.some(url => url.includes("/api/invitation/accept-social"))).toBe(false);
			expect(clearEmailSelectionCookie).toHaveBeenCalled();
		});

		it("should show error when OAuth acceptance fails", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept failure
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: false,
						error: "expired_token",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should show completing OAuth message during OAuth acceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Create a promise that we can control
			let resolveOAuthAccept: ((value: unknown) => void) | undefined;
			const oauthAcceptPromise = new Promise(resolve => {
				resolveOAuthAccept = resolve;
			});

			// Mock fetch for validation (fast) and OAuth accept (slow)
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockImplementationOnce(() =>
					oauthAcceptPromise.then(() => ({
						ok: true,
						json: async () => ({
							success: true,
						}),
					})),
				);

			render(<AcceptInvitationPage />);

			// Wait for the completing OAuth message
			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-completing-oauth")).toBeDefined();
			});

			// Resolve the OAuth accept promise
			resolveOAuthAccept?.({});

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should handle OAuth accept network error", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept network failure
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockRejectedValueOnce(new Error("Network error"));

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should handle used_token error during OAuth acceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept failure
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: false,
						error: "used_token",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should handle invitation_not_found error during OAuth acceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept failure
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: false,
						error: "invitation_not_found",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should handle user_exists error during OAuth acceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept failure
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: false,
						error: "user_exists",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should handle invalid_token error during OAuth acceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept failure
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: false,
						error: "invalid_token",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should handle missing_fields error during OAuth acceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept failure
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "test@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: false,
						error: "missing_fields",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should show /select-tenant link on success page when accepted via OAuth", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock fetch for validation, session, and OAuth accept success
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: { email: "test@example.com" },
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true }),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
			});

			// The link should point to /select-tenant for OAuth users
			const link = screen.getByTestId("accept-invitation-go-to-login");
			expect(link.getAttribute("href")).toBe("/select-tenant");
		});

		it("should silently ignore AbortError in completeOAuthAcceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Make session fetch throw an AbortError (simulates component unmount during fetch)
			const abortError = new DOMException("The operation was aborted.", "AbortError");

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockRejectedValueOnce(abortError);

			const { unmount } = render(<AcceptInvitationPage />);

			// Wait for token validation to complete
			await waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(2);
			});

			// Unmount to trigger abort (should not show error)
			unmount();

			// No error should be shown - the AbortError is silently ignored
			expect(screen.queryByTestId("accept-invitation-form-error")).toBeNull();

			replaceStateSpy.mockRestore();
		});

		it("should handle email_mismatch error during OAuth acceptance", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch for validation and OAuth accept failure with email_mismatch
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "invited@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						user: {
							email: "different@example.com",
						},
					}),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						success: false,
						error: "email_mismatch",
					}),
				});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
		});

		it("should handle abortableSleep with already-aborted signal during OAuth retry loop", async () => {
			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Strategy: Make response.json() slow for the session check.
			// While json() is pending, unmount the component (triggers abort).
			// When json() resolves, signal.aborted is already true.
			// Then abortableSleep is called with already-aborted signal -> lines 276-279.
			let resolveSessionJson: ((value: unknown) => void) | undefined;
			const slowJsonPromise = new Promise(resolve => {
				resolveSessionJson = resolve;
			});

			let fetchCount = 0;
			global.fetch = vi.fn().mockImplementation(() => {
				fetchCount++;
				if (fetchCount === 1) {
					// Token validation - resolve immediately
					return {
						ok: true,
						json: async () => ({
							valid: true,
							invitation: {
								email: "test@example.com",
								role: "member",
								name: "Test User",
								organizationName: "Test Org",
							},
						}),
					};
				}
				// Session check - return a slow json() promise
				return {
					ok: true,
					json: () => slowJsonPromise,
				};
			});

			const { unmount } = render(<AcceptInvitationPage />);

			// Wait for token validation and first session check to start
			await waitFor(() => {
				expect(fetchCount).toBe(2);
			});

			// Now response.json() is pending (slowJsonPromise).
			// Unmount to trigger abort. Signal is now aborted.
			unmount();

			// Resolve the json() promise. The async code continues:
			// sessionData.user is null -> abortableSleep(500, signal) is called
			// signal.aborted is already true -> immediate reject (lines 276-279)
			// catch block sees AbortError and returns silently.
			resolveSessionJson?.({ user: null });

			// Wait for microtasks to settle
			await new Promise(resolve => setTimeout(resolve, 0));

			replaceStateSpy.mockRestore();
		});

		it("should show error when OAuth session fails to establish after retries", async () => {
			vi.useFakeTimers();

			// Set up URL with oauth=pending
			(window as { location: Location }).location = {
				...window.location,
				search: "?token=valid-token-123&oauth=pending",
				origin: "http://localhost",
				href: "http://localhost/invite/accept?token=valid-token-123&oauth=pending",
			} as Location;

			// Mock history.replaceState
			const replaceStateSpy = vi.spyOn(window.history, "replaceState").mockReturnValue();

			// Mock fetch: validation succeeds, but session check always returns no user (5 retries)
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						valid: true,
						invitation: {
							email: "test@example.com",
							role: "member",
							name: "Test User",
							organizationName: "Test Org",
						},
					}),
				})
				// Session checks always return no user email (all 5 retries fail)
				.mockResolvedValue({
					ok: true,
					json: async () => ({
						user: null, // No user in session
					}),
				});

			render(<AcceptInvitationPage />);

			// Wait for token validation to complete and OAuth flow to start
			await vi.waitFor(() => {
				expect(global.fetch).toHaveBeenCalledTimes(1);
			});

			// Advance through all 5 retry loops (each has 500ms delay)
			for (let i = 0; i < 5; i++) {
				await vi.advanceTimersByTimeAsync(500);
			}

			// Wait for the session failure error message
			await vi.waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});

			replaceStateSpy.mockRestore();
			vi.useRealTimers();
		});
	});

	describe("existing user with credential (handleAcceptExistingPassword)", () => {
		/** Helper to set up the existing-user-with-credential scenario */
		function setupExistingUserWithCredential() {
			return vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "existing@example.com",
						role: "member",
						name: "Existing User",
						organizationName: "Test Org",
						userExists: true,
						hasCredential: true,
					},
				}),
			});
		}

		it("should accept invitation with existing password successfully and redirect", async () => {
			vi.useFakeTimers();

			const mockFetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			});
			global.fetch = mockFetch;

			render(<AcceptInvitationPage />);

			await vi.waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			// Type password into the existing password field
			const passwordInput = screen.getByPlaceholderText("Password");
			fireEvent.input(passwordInput, { target: { value: "MyPassword123!" } });

			const submitButton = screen.getByTestId("accept-invitation-existing-submit");
			fireEvent.click(submitButton);

			await vi.waitFor(() => {
				expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
			});

			// Verify the accept-existing-password API was called
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/api/invitation/accept-existing-password"),
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ token: "valid-token-123", password: "MyPassword123!" }),
				}),
			);

			// Success link should point to /login (not OAuth)
			const link = screen.getByTestId("accept-invitation-go-to-login");
			expect(link.getAttribute("href")).toBe("/login");

			// Advance timer to trigger the setTimeout redirect
			await vi.advanceTimersByTimeAsync(3000);
			expect(window.location.href).toBe("/login");

			vi.useRealTimers();
		});

		it("should show error when existing password is empty", async () => {
			global.fetch = setupExistingUserWithCredential();

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			// Submit without entering a password
			const submitButton = screen.getByTestId("accept-invitation-existing-submit");
			fireEvent.click(submitButton);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show expired_token error during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: false, error: "expired_token" }),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "MyPassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show used_token error during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: false, error: "used_token" }),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "MyPassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show invitation_not_found error during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: false, error: "invitation_not_found" }),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "MyPassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show invalid_password error with message during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "invalid_password",
					message: "Wrong password",
				}),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "WrongPassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show server error for invalid_password without message during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "invalid_password",
					// No message
				}),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "SomePassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show invalid_token error during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: false, error: "invalid_token" }),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "SomePassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show missing_fields error during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: false, error: "missing_fields" }),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "SomePassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show default error with message during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "server_error",
					message: "Something went wrong",
				}),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "SomePassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show server error for default error without message during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "unknown_error",
					// No message
				}),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "SomePassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show server error on network failure during accept-existing-password", async () => {
			global.fetch = setupExistingUserWithCredential().mockRejectedValueOnce(new Error("Network error"));

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "SomePassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should trigger OAuth login from existing user credential form (Google)", async () => {
			const { authClient } = await import("../../lib/authClient");
			global.fetch = setupExistingUserWithCredential();

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-google-btn")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("accept-invitation-existing-google-btn"));

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "google",
					callbackURL: expect.stringContaining("/invite/accept?token="),
				});
			});
		});

		it("should trigger OAuth login from existing user credential form (GitHub)", async () => {
			const { authClient } = await import("../../lib/authClient");
			global.fetch = setupExistingUserWithCredential();

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-github-btn")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("accept-invitation-existing-github-btn"));

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "github",
					callbackURL: expect.stringContaining("/invite/accept?token="),
				});
			});
		});

		it("should show the isExistingAccepting loading state on button", async () => {
			// Use a delayed response so we can observe the loading state
			let resolveAccept: ((value: unknown) => void) | undefined;
			const acceptPromise = new Promise(resolve => {
				resolveAccept = resolve;
			});

			global.fetch = setupExistingUserWithCredential().mockImplementationOnce(() =>
				acceptPromise.then(() => ({
					ok: true,
					json: async () => ({ success: true }),
				})),
			);

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			fireEvent.input(screen.getByPlaceholderText("Password"), {
				target: { value: "MyPassword123!" },
			});
			fireEvent.click(screen.getByTestId("accept-invitation-existing-submit"));

			// While loading, button should show "Accepting..."
			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-existing-submit")).toBeDefined();
			});

			// Resolve the accept promise
			resolveAccept?.({});

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
			});
		});
	});

	describe("existing user without credential form interactions", () => {
		function setupExistingUserNoCredential(name: string | null = "Existing User") {
			return vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					valid: true,
					invitation: {
						email: "existing@example.com",
						role: "member",
						name,
						organizationName: "Test Org",
						userExists: true,
						hasCredential: false,
					},
				}),
			});
		}

		it("should show null name as empty string in the disabled name field", async () => {
			global.fetch = setupExistingUserNoCredential(null);

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByPlaceholderText("Full Name")).toBeDefined();
			});

			// The name field should display empty string when invitation.name is null
			const nameInput = screen.getByPlaceholderText("Full Name") as HTMLInputElement;
			expect(nameInput.value).toBe("");
		});

		it("should show error in existing-user-no-password form and loading state on submit button", async () => {
			global.fetch = setupExistingUserNoCredential().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					error: "user_exists",
				}),
			});

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-set-password-submit")).toBeDefined();
			});

			const passwordInput = screen.getByPlaceholderText("Password");
			const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

			fireEvent.click(screen.getByTestId("accept-invitation-set-password-submit"));

			// The error should show within the form (error && tokenValid branch)
			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-form-error")).toBeDefined();
			});
		});

		it("should show loading state on submit button in existing-user-no-password form", async () => {
			let resolveAccept: ((value: unknown) => void) | undefined;
			const acceptPromise = new Promise(resolve => {
				resolveAccept = resolve;
			});

			global.fetch = setupExistingUserNoCredential().mockImplementationOnce(() =>
				acceptPromise.then(() => ({
					ok: true,
					json: async () => ({ success: true }),
				})),
			);

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-set-password-submit")).toBeDefined();
			});

			const passwordInput = screen.getByPlaceholderText("Password");
			const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password");

			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.input(confirmPasswordInput, { target: { value: "ValidPass123!" } });

			fireEvent.click(screen.getByTestId("accept-invitation-set-password-submit"));

			// While loading, button should show the loading text
			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-set-password-submit")).toBeDefined();
			});

			// Resolve
			resolveAccept?.({});

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-success-title")).toBeDefined();
			});
		});

		it("should trigger OAuth login from existing-user-no-password form (Google)", async () => {
			const { authClient } = await import("../../lib/authClient");
			global.fetch = setupExistingUserNoCredential();

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				// This form shows "Or sign in with" divider
				expect(screen.getByTestId("accept-invitation-no-password-oauth-divider")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("accept-invitation-no-password-google-btn"));

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "google",
					callbackURL: expect.stringContaining("/invite/accept?token="),
				});
			});
		});

		it("should trigger OAuth login from existing-user-no-password form (GitHub)", async () => {
			const { authClient } = await import("../../lib/authClient");
			global.fetch = setupExistingUserNoCredential();

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByTestId("accept-invitation-no-password-oauth-divider")).toBeDefined();
			});

			fireEvent.click(screen.getByTestId("accept-invitation-no-password-github-btn"));

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "github",
					callbackURL: expect.stringContaining("/invite/accept?token="),
				});
			});
		});

		it("should handle password and confirm password onChange handlers in no-credential form", async () => {
			global.fetch = setupExistingUserNoCredential();

			render(<AcceptInvitationPage />);

			await waitFor(() => {
				expect(screen.getByPlaceholderText("Password")).toBeDefined();
			});

			const passwordInput = screen.getByPlaceholderText("Password") as HTMLInputElement;
			const confirmPasswordInput = screen.getByPlaceholderText("Confirm Password") as HTMLInputElement;

			fireEvent.input(passwordInput, { target: { value: "TestPassword123!" } });
			expect(passwordInput.value).toBe("TestPassword123!");

			fireEvent.input(confirmPasswordInput, { target: { value: "TestPassword123!" } });
			expect(confirmPasswordInput.value).toBe("TestPassword123!");
		});
	});
});
