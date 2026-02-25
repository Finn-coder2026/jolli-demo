import { authClient, useSession } from "../../lib/authClient";
import { LoginPage } from "./LoginPage";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock authClient
vi.mock("../../lib/authClient", () => ({
	authClient: {
		signIn: {
			email: vi.fn(),
			social: vi.fn(),
		},
	},
	useSession: vi.fn(),
}));

// Mock useIntlayer - default content (mutable for per-test overrides)
const defaultAuthContent = {
	brandName: "Jolli",
	tagline: "Documentation Intelligence",
	email: { value: "Email" },
	password: { value: "Password" },
	login: "Sign In",
	loggingIn: "Signing in...",
	orLoginWith: "or continue with",
	loginWithGoogle: "Login with Google",
	loginWithGitHub: "Login with GitHub",
	forgotPassword: { value: "Forgot password?" },
	loginError: { value: "Login failed. Please try again." },
	loginFailed: { value: "Invalid email or password." },
	accountLocked: { value: "Account temporarily locked due to too many failed attempts." },
	accountInactive: { value: "Your account has been deactivated. Please contact your administrator." },
	rateLimitExceeded: { value: "Too many login attempts. Please try again later." },
	emailRequired: { value: "Email is required" },
	emailInvalid: { value: "Please enter a valid email address" },
	passwordRequired: { value: "Password is required" },
	passwordTooShort: { value: "Password must be at least 8 characters" },
	passwordTooLong: { value: "Password must be less than 36 characters" },
	passwordNeedsUppercase: { value: "Password must contain at least one uppercase letter" },
	passwordNeedsLowercase: { value: "Password must contain at least one lowercase letter" },
	passwordNeedsNumber: { value: "Password must contain at least one number" },
	passwordNeedsSpecialChar: { value: "Password must contain at least one special character" },
	passwordContainsEmail: { value: "Password cannot contain your email address" },
	rememberMe: { value: "Keep me signed in" },
	selectEmailTitle: { value: "Select Your Email Address" },
	selectEmailSubtitle: {
		value: "GitHub returned multiple verified email addresses. Please select which one to use for your Jolli account:",
	},
	primaryBadge: { value: "Primary" },
	submitting: { value: "Confirming..." },
	continue: { value: "Continue" },
};

let mockAuthContent: Record<string, unknown> = { ...defaultAuthContent };

vi.mock("react-intlayer", () => ({
	useIntlayer: () => mockAuthContent,
}));

describe("LoginPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAuthContent = { ...defaultAuthContent };
		vi.mocked(authClient.signIn.email).mockClear();
		vi.mocked(authClient.signIn.social).mockClear();
		// Mock useSession to return not authenticated by default
		vi.mocked(useSession).mockReturnValue({
			data: null,
			isPending: false,
			error: null,
		} as never);
		global.fetch = vi.fn();
		delete (window as { location?: Location }).location;
		(window as { location: Location }).location = { href: "", search: "" } as Location;
		// Clear localStorage and cookies before each test (important for remember-me checkbox tests)
		localStorage.clear();
		// Clear the remember-me preference cookie - set to empty with past expiry
		// biome-ignore lint/suspicious/noDocumentCookie: intentionally clearing cookie in test setup
		document.cookie = "jolli_rememberMe_pref=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
		// Also set to false explicitly as a fallback
		// biome-ignore lint/suspicious/noDocumentCookie: intentionally clearing cookie in test setup
		document.cookie = "jolli_rememberMe_pref=false; path=/";
	});

	describe("Password Login", () => {
		it("should render login form", () => {
			render(<LoginPage />);

			expect(screen.getByText("Jolli")).toBeDefined();
			expect(screen.getByPlaceholderText("Email")).toBeDefined();
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
			expect(screen.getByText("Sign In")).toBeDefined();
		});

		it("should show OAuth login buttons", () => {
			render(<LoginPage />);

			expect(screen.getByText("Login with Google")).toBeDefined();
			expect(screen.getByText("Login with GitHub")).toBeDefined();
		});

		it("should handle successful password login", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null });

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(authClient.signIn.email).toHaveBeenCalledWith({
					email: "test@example.com",
					password: "Password123!",
					rememberMe: false,
				});
			});

			expect(window.location.href).toBe("/select-tenant");
		});

		it("should show error on failed login", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({ error: { message: "Invalid credentials" } });

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "WrongPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Invalid email or password.")).toBeDefined();
			});
		});

		it("should show account locked error by code", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({
				error: { code: "account_locked", message: "Account locked", status: 423, statusText: "Locked" },
			});

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Account temporarily locked due to too many failed attempts.")).toBeDefined();
			});
		});

		it("should show account locked error by status 423", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({
				error: { message: "Locked", status: 423, statusText: "Locked" },
			});

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Account temporarily locked due to too many failed attempts.")).toBeDefined();
			});
		});

		it("should show inactive account error by message", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({
				error: { message: "ACCOUNT_INACTIVE", status: 403, statusText: "Forbidden" },
			});

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "inactive@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(
					screen.getByText("Your account has been deactivated. Please contact your administrator."),
				).toBeDefined();
			});
		});

		it("should show inactive account error by status 403", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({
				error: { message: "Forbidden", status: 403, statusText: "Forbidden" },
			});

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "inactive@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(
					screen.getByText("Your account has been deactivated. Please contact your administrator."),
				).toBeDefined();
			});
		});

		it("should show rate limit error by code", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({
				error: {
					code: "rate_limit_exceeded",
					message: "Rate limit",
					status: 429,
					statusText: "Too Many Requests",
				},
			});

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Too many login attempts. Please try again later.")).toBeDefined();
			});
		});

		it("should show rate limit error by status 429", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({
				error: { message: "Too Many Requests", status: 429, statusText: "Too Many Requests" },
			});

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Too many login attempts. Please try again later.")).toBeDefined();
			});
		});

		it("should handle network error", async () => {
			vi.mocked(authClient.signIn.email).mockRejectedValue(new Error("Network error"));

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "ValidPass123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Login failed. Please try again.")).toBeDefined();
			});
		});

		it("should show error when password contains email prefix", async () => {
			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "johndoe@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "JohnDoe123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Password cannot contain your email address")).toBeDefined();
			});

			// Ensure login was not attempted
			expect(authClient.signIn.email).not.toHaveBeenCalled();
		});

		it("should show error when password lacks an uppercase letter", async () => {
			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "password123!" } }); // No uppercase
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Password must contain at least one uppercase letter")).toBeDefined();
			});

			expect(authClient.signIn.email).not.toHaveBeenCalled();
		});

		it("should show error when password lacks a lowercase letter", async () => {
			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "PASSWORD123!" } }); // No lowercase
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Password must contain at least one lowercase letter")).toBeDefined();
			});

			expect(authClient.signIn.email).not.toHaveBeenCalled();
		});

		it("should show error when password lacks a number", async () => {
			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password!" } }); // No number
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Password must contain at least one number")).toBeDefined();
			});

			expect(authClient.signIn.email).not.toHaveBeenCalled();
		});

		it("should show error when password lacks a special character", async () => {
			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password123" } }); // No special char
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(screen.getByText("Password must contain at least one special character")).toBeDefined();
			});

			expect(authClient.signIn.email).not.toHaveBeenCalled();
		});
	});

	describe("OAuth Login", () => {
		it("should call signIn.social for Google OAuth with rememberMe false when unchecked", async () => {
			vi.mocked(authClient.signIn.social).mockResolvedValue({});

			render(<LoginPage />);

			const googleButton = screen.getByText("Login with Google");
			fireEvent.click(googleButton);

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "google",
					callbackURL: "/login",
					additionalData: { rememberMe: false },
				});
			});
		});

		it("should call signIn.social for GitHub OAuth with rememberMe false when unchecked", async () => {
			vi.mocked(authClient.signIn.social).mockResolvedValue({});

			render(<LoginPage />);

			const githubButton = screen.getByText("Login with GitHub");
			fireEvent.click(githubButton);

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "github",
					callbackURL: "/login",
					additionalData: { rememberMe: false },
				});
			});
		});

		it("should always pass rememberMe false for Google OAuth even when checkbox is checked", async () => {
			vi.mocked(authClient.signIn.social).mockResolvedValue({});

			render(<LoginPage />);

			const checkbox = screen.getByTestId("remember-me-checkbox");
			fireEvent.click(checkbox);

			const googleButton = screen.getByText("Login with Google");
			fireEvent.click(googleButton);

			// Remember-me flag is not passed to OAuth login (always false)
			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "google",
					callbackURL: "/login",
					additionalData: { rememberMe: false },
				});
			});
		});

		it("should always pass rememberMe false for GitHub OAuth even when checkbox is checked", async () => {
			vi.mocked(authClient.signIn.social).mockResolvedValue({});

			render(<LoginPage />);

			const checkbox = screen.getByTestId("remember-me-checkbox");
			fireEvent.click(checkbox);

			const githubButton = screen.getByText("Login with GitHub");
			fireEvent.click(githubButton);

			// Remember-me flag is not passed to OAuth login (always false)
			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "github",
					callbackURL: "/login",
					additionalData: { rememberMe: false },
				});
			});
		});
	});

	describe("URL Error Handling", () => {
		it("should show account locked error from URL", () => {
			window.location.search = "?error=account_locked";

			render(<LoginPage />);

			expect(screen.getByText("Account temporarily locked due to too many failed attempts.")).toBeDefined();
		});

		it("should show inactive account error from URL", () => {
			window.location.search = "?error=user_inactive";

			render(<LoginPage />);

			expect(
				screen.getByText("Your account has been deactivated. Please contact your administrator."),
			).toBeDefined();
		});

		it("should show generic error from URL", () => {
			window.location.search = "?error=server_error";

			render(<LoginPage />);

			expect(screen.getByText("Login failed. Please try again.")).toBeDefined();
		});
	});

	describe("Query Param Passthrough", () => {
		it("should pass redirect param to tenant selector after password login", async () => {
			window.location.search = "?redirect=%2Fusers";
			vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null });

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(window.location.href).toBe("/select-tenant?redirect=%2Fusers");
			});
		});

		it("should use /login as OAuth callback", async () => {
			window.location.search = "?redirect=%2Farticles";
			vi.mocked(authClient.signIn.social).mockResolvedValue({});

			render(<LoginPage />);

			const googleButton = screen.getByText("Login with Google");
			fireEvent.click(googleButton);

			await waitFor(() => {
				expect(authClient.signIn.social).toHaveBeenCalledWith({
					provider: "google",
					callbackURL: "/login",
					additionalData: { rememberMe: false },
				});
			});
		});

		it("should pass through all query params without sanitization (TenantSelector sanitizes)", async () => {
			// LoginPage passes through query params as-is; TenantSelector handles sanitization
			window.location.search = "?redirect=https%3A%2F%2Fevil.com";
			vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null });

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				// LoginPage passes query params through; TenantSelector will sanitize
				expect(window.location.href).toBe("/select-tenant?redirect=https%3A%2F%2Fevil.com");
			});
		});
	});

	describe("Branch Coverage", () => {
		it("should show email validation error for invalid email format", async () => {
			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");

			// Use email that passes HTML5 type="email" validation but fails custom regex (no dot in domain)
			fireEvent.input(emailInput, { target: { value: "user@domain" } });
			fireEvent.input(passwordInput, { target: { value: "Password123!" } });

			// Submit form directly to bypass potential HTML5 validation on button click
			const form = emailInput.closest("form") as HTMLFormElement;
			fireEvent.submit(form);

			await waitFor(() => {
				expect(screen.getByText("Please enter a valid email address")).toBeDefined();
			});
		});

		it("should render fallback text when intlayer content fields are missing", () => {
			// Override content to omit rememberMe and forgotPassword
			mockAuthContent = {
				...defaultAuthContent,
				rememberMe: undefined,
				forgotPassword: undefined,
			};

			render(<LoginPage />);

			// Should fall back to hardcoded strings
			expect(screen.getByText("Keep me signed in")).toBeDefined();
			expect(screen.getByText("Forgot password?")).toBeDefined();
		});
	});

	describe("Session Check", () => {
		it("should show loading spinner while checking session", () => {
			vi.mocked(useSession).mockReturnValue({
				data: null,
				isPending: true,
				error: null,
			} as never);

			render(<LoginPage />);

			expect(screen.getByTestId("session-loading-spinner")).toBeDefined();
		});

		it("should redirect to tenant selector when user is already authenticated", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
			});
			vi.mocked(useSession).mockReturnValue({
				data: { user: { id: "123", email: "test@example.com" } },
				isPending: false,
				error: null,
			} as never);

			render(<LoginPage />);

			await waitFor(() => {
				expect(window.location.href).toBe("/select-tenant");
			});
		});

		it("should redirect to tenant selector with query params when authenticated", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
			});
			window.location.search = "?redirect=%2Fdashboard";
			vi.mocked(useSession).mockReturnValue({
				data: { user: { id: "123", email: "test@example.com" } },
				isPending: false,
				error: null,
			} as never);

			render(<LoginPage />);

			await waitFor(() => {
				expect(window.location.href).toBe("/select-tenant?redirect=%2Fdashboard");
			});
		});

		it("should NOT redirect when URL has error param even with valid session", async () => {
			window.location.search = "?error=user_inactive";
			vi.mocked(useSession).mockReturnValue({
				data: { user: { id: "123", email: "test@example.com" } },
				isPending: false,
				error: null,
			} as never);

			render(<LoginPage />);

			// Should show error message instead of redirecting
			await waitFor(() => {
				expect(
					screen.getByText("Your account has been deactivated. Please contact your administrator."),
				).toBeDefined();
			});
			// Should NOT have redirected
			expect(window.location.href).not.toContain("/select-tenant");
			expect(global.fetch).not.toHaveBeenCalled();
		});

		it("should NOT redirect when email_selection cookie exists even with valid session", async () => {
			// Set email_selection cookie
			const emailSelectionData = JSON.stringify({
				code: "test_code_123",
				primary: "test@example.com",
			});
			Object.defineProperty(document, "cookie", {
				writable: true,
				value: `email_selection=${encodeURIComponent(emailSelectionData)}`,
			});
			vi.mocked(useSession).mockReturnValue({
				data: { user: { id: "123", email: "test@example.com" } },
				isPending: false,
				error: null,
			} as never);

			// Mock fetch for /auth/validate-code to return email list
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					pendingEmailSelection: {
						emails: ["test@example.com", "test2@example.com"],
					},
				}),
			});

			render(<LoginPage />);

			// Should NOT redirect to tenant selector
			await waitFor(
				() => {
					expect(window.location.href).not.toContain("/select-tenant");
				},
				{ timeout: 1000 },
			);

			// Should eventually show email selection UI
			await waitFor(
				() => {
					expect(screen.getByText(/multiple verified email/i)).toBeDefined();
				},
				{ timeout: 2000 },
			);
		});

		it("should redirect when session exists and tenant auth check succeeds", async () => {
			// Clear cookies
			Object.defineProperty(document, "cookie", {
				writable: true,
				value: "",
			});
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
			});
			vi.mocked(useSession).mockReturnValue({
				data: { user: { id: "123", email: "test@example.com" } },
				isPending: false,
				error: null,
			} as never);

			render(<LoginPage />);

			await waitFor(() => {
				expect(window.location.href).toBe("/select-tenant");
			});
		});

		it("should NOT redirect when session exists but tenant auth check fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
			});
			vi.mocked(useSession).mockReturnValue({
				data: { user: { id: "123", email: "test@example.com" } },
				isPending: false,
				error: null,
			} as never);

			render(<LoginPage />);

			await waitFor(() => {
				expect(global.fetch).toHaveBeenCalledWith(
					"/api/auth/tenants",
					expect.objectContaining({ credentials: "include" }),
				);
			});
			expect(window.location.href).toBe("");
		});

		it("should skip tenant auth check on auth gateway host", async () => {
			(window as { location: Location }).location = {
				href: "",
				search: "",
				hostname: "auth.jolli-local.me",
			} as Location;
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
			});
			vi.mocked(useSession).mockReturnValue({
				data: { user: { id: "123", email: "test@example.com" } },
				isPending: false,
				error: null,
			} as never);

			render(<LoginPage />);

			await waitFor(() => {
				expect(useSession).toHaveBeenCalled();
			});
			expect(global.fetch).not.toHaveBeenCalledWith(
				"/api/auth/tenants",
				expect.objectContaining({ credentials: "include" }),
			);
			expect(window.location.href).toBe("");
		});

		it("should render login form when session check completes with no user", () => {
			vi.mocked(useSession).mockReturnValue({
				data: null,
				isPending: false,
				error: null,
			} as never);

			render(<LoginPage />);

			expect(screen.getByText("Jolli")).toBeDefined();
			expect(screen.getByPlaceholderText("Email")).toBeDefined();
			expect(screen.getByPlaceholderText("Password")).toBeDefined();
		});
	});

	describe("Remember Me Checkbox", () => {
		it("should render remember me checkbox", () => {
			render(<LoginPage />);

			expect(screen.getByTestId("remember-me-checkbox")).toBeDefined();
			expect(screen.getByText("Keep me signed in")).toBeDefined();
		});

		it("should checkbox default to unchecked", () => {
			render(<LoginPage />);

			const checkbox = screen.getByTestId("remember-me-checkbox") as HTMLInputElement;
			expect(checkbox.checked).toBe(false);
		});

		it("should toggle checkbox state on click", () => {
			render(<LoginPage />);

			const checkbox = screen.getByTestId("remember-me-checkbox") as HTMLInputElement;
			expect(checkbox.checked).toBe(false);

			fireEvent.click(checkbox);
			expect(checkbox.checked).toBe(true);

			fireEvent.click(checkbox);
			expect(checkbox.checked).toBe(false);
		});

		it("should pass rememberMe=true to signIn when checkbox is checked", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null });

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const checkbox = screen.getByTestId("remember-me-checkbox");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password123!" } });
			fireEvent.click(checkbox);
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(authClient.signIn.email).toHaveBeenCalledWith({
					email: "test@example.com",
					password: "Password123!",
					rememberMe: true,
				});
			});
		});

		it("should pass rememberMe=false to signIn when checkbox is not checked", async () => {
			vi.mocked(authClient.signIn.email).mockResolvedValue({ error: null });

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				expect(authClient.signIn.email).toHaveBeenCalledWith({
					email: "test@example.com",
					password: "Password123!",
					rememberMe: false,
				});
			});
		});

		it("should disable checkbox when loading", async () => {
			vi.mocked(authClient.signIn.email).mockImplementation(
				// biome-ignore lint/suspicious/noEmptyBlockStatements: Never resolves to keep loading state
				() => new Promise(() => {}),
			);

			render(<LoginPage />);

			const emailInput = screen.getByPlaceholderText("Email");
			const passwordInput = screen.getByPlaceholderText("Password");
			const loginButton = screen.getByText("Sign In");

			fireEvent.input(emailInput, { target: { value: "test@example.com" } });
			fireEvent.input(passwordInput, { target: { value: "Password123!" } });
			fireEvent.click(loginButton);

			await waitFor(() => {
				const checkbox = screen.getByTestId("remember-me-checkbox") as HTMLInputElement;
				expect(checkbox.disabled).toBe(true);
			});
		});
	});
});
