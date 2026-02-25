import { authClient, useSession } from "../../lib/authClient";
import {
	clearEmailSelectionCookie,
	getEmailSelectionCookieData,
	getRememberMePreference,
	hasEmailSelectionCookie,
	saveRememberMePreference,
} from "../../util/AuthCookieUtil";
import styles from "./LoginPage.module.css";
import { type PasswordValidationError, validatePassword as validatePasswordShared } from "jolli-common";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export function LoginPage(): ReactElement {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [emailError, setEmailError] = useState("");
	const [passwordError, setPasswordError] = useState("");
	const [loading, setLoading] = useState(false);
	const [rememberMe, setRememberMe] = useState(getRememberMePreference);
	const content = useIntlayer("auth");

	// Email selection state (for GitHub OAuth with multiple verified emails)
	const [showEmailSelection, setShowEmailSelection] = useState(false);
	const [authCode, setAuthCode] = useState<string>("");
	const [pendingEmails, setPendingEmails] = useState<Array<string>>([]);
	const [selectedEmail, setSelectedEmail] = useState<string>("");
	const [primaryEmail, setPrimaryEmail] = useState<string>("");

	// Check if user is already authenticated
	const { data: session, isPending: isSessionPending } = useSession();

	// Build tenant selector URL preserving any query params (like redirect)
	const tenantSelectorUrl = `/select-tenant${window.location.search}`;

	// Redirect to tenant selector if already authenticated.
	// authToken is HttpOnly and cannot be read via document.cookie in the browser.
	// Skip redirect when URL has an error param (e.g., user_inactive) — the user was
	// deliberately sent here to see the error message
	// Skip redirect when select_email=true — user needs to select GitHub email first
	// Skip redirect when email_selection cookie exists — user needs to select GitHub email first
	// Skip redirect when showEmailSelection is true — user is currently selecting email
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const hasUrlError = params.has("error");
		const isSelectingEmail = params.get("select_email") === "true";
		const hasPendingEmailSelection = hasEmailSelectionCookie();
		const hostname = window.location.hostname;
		const isAuthGatewayHost =
			typeof hostname === "string" &&
			hostname.length > 0 &&
			hostname.split(".").length >= 2 &&
			hostname.startsWith("auth.");

		if (
			session?.user &&
			!isSessionPending &&
			!hasUrlError &&
			!isSelectingEmail &&
			!hasPendingEmailSelection &&
			!showEmailSelection &&
			!isAuthGatewayHost
		) {
			const abortController = new AbortController();

			// Prevent login <-> select-tenant redirect loops when better-auth session exists
			// but backend JWT auth (authToken) is not usable.
			void fetch("/api/auth/tenants", {
				credentials: "include",
				signal: abortController.signal,
			})
				.then(response => {
					if (response.ok) {
						window.location.href = tenantSelectorUrl;
						return;
					}
				})
				.catch(error => {
					// Ignore aborts during re-render/unmount.
					if (error instanceof Error && error.name === "AbortError") {
						return;
					}
				});

			return () => {
				abortController.abort();
			};
		}
	}, [session, isSessionPending, tenantSelectorUrl, showEmailSelection]);
	// Check for OAuth errors in URL
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const urlError = params.get("error");

		if (urlError === "account_locked") {
			setError(content.accountLocked.value);
		} else if (urlError === "user_inactive") {
			setError(content.accountInactive.value);
		} else if (urlError) {
			setError(content.loginError.value);
		}
	}, [content]);

	// Check for GitHub email selection (multiple verified emails)
	useEffect(() => {
		// Check URL parameters first
		const params = new URLSearchParams(window.location.search);
		let selectEmail = params.get("select_email");
		let code = params.get("code");
		let primary = params.get("primary");

		// If not in URL, check for email_selection cookie (set by backend after GitHub OAuth)
		if (!selectEmail || !code) {
			const emailSelection = getEmailSelectionCookieData();
			if (emailSelection) {
				code = emailSelection.code;
				primary = emailSelection.primary ?? null;
				selectEmail = "true";

				// Don't clear cookie yet - we'll clear it after email selection UI is set up
				// This prevents race condition with session redirect

				// Update URL to include parameters (for consistency)
				// IMPORTANT: Use /login path, not /, because user is on /login page
				window.history.replaceState(
					{},
					"",
					`/login?select_email=true&code=${code}&primary=${encodeURIComponent(primary || "")}`,
				);
			}
		}

		if (selectEmail === "true" && code) {
			// CRITICAL: Set showEmailSelection IMMEDIATELY to prevent session redirect race condition
			// This must happen synchronously BEFORE the async fetch starts
			setShowEmailSelection(true);
			setAuthCode(code);
			// Extract emails from encrypted code via backend validation
			fetch("/auth/validate-code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ code }),
			})
				.then(res => {
					if (!res.ok) {
						return res.json().then(
							data => {
								throw new Error(data.error || "Code expired or invalid");
							},
							() => {
								throw new Error(`HTTP ${res.status}: ${res.statusText}`);
							},
						);
					}
					return res.json();
				})
				.then(data => {
					if (data.pendingEmailSelection) {
						setPendingEmails(data.pendingEmailSelection.emails);
						setPrimaryEmail(primary || data.pendingEmailSelection.emails[0]);
						setSelectedEmail(primary || data.pendingEmailSelection.emails[0]);
						// showEmailSelection already set to true above (synchronously)

						// Clear the cookie now that UI is set up (prevents re-triggering on refresh)
						clearEmailSelectionCookie();
					} else {
						throw new Error("No email selection data in response");
					}
				})
				.catch(err => {
					setError(`Failed to load email selection: ${err.message}`);
					// Reset showEmailSelection if fetch fails
					setShowEmailSelection(false);
					// Clear the cookie on error
					clearEmailSelectionCookie();
					// Don't clear URL immediately - let user see the error
					// window.history.replaceState({}, "", "/");
				});
		}
	}, [content]);
	// Email validation
	function validateEmail(emailValue: string): boolean {
		setEmailError("");

		/* v8 ignore start -- defensive validation, form has required attribute */
		if (!emailValue) {
			setEmailError(content.emailRequired.value);
			return false;
		}
		/* v8 ignore stop */

		// RFC 5322 compliant email regex (simplified)
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		/* v8 ignore start -- defensive validation, browser validates email format */
		if (!emailRegex.test(emailValue)) {
			setEmailError(content.emailInvalid.value);
			return false;
		}
		/* v8 ignore stop */

		return true;
	}

	/**
	 * Get localized error message for password validation error.
	 */
	function getPasswordErrorMessage(error: PasswordValidationError): string {
		const errorMessages: Record<PasswordValidationError, string> = {
			required: content.passwordRequired.value,
			too_short: content.passwordTooShort.value,
			too_long: content.passwordTooLong.value,
			needs_uppercase: content.passwordNeedsUppercase.value,
			needs_lowercase: content.passwordNeedsLowercase.value,
			needs_number: content.passwordNeedsNumber.value,
			needs_special: content.passwordNeedsSpecialChar.value,
			contains_email: content.passwordContainsEmail.value,
		};
		return errorMessages[error];
	}

	// Password validation using shared validation from jolli-common
	function validatePassword(passwordValue: string): boolean {
		setPasswordError("");

		const result = validatePasswordShared(passwordValue, email);
		if (!result.valid && result.error) {
			setPasswordError(getPasswordErrorMessage(result.error));
			return false;
		}

		return true;
	}

	// Handle GitHub email selection submission
	async function handleEmailSelection(e: React.FormEvent) {
		e.preventDefault();
		setLoading(true);
		setError("");

		try {
			const response = await fetch("/auth/select-email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					code: authCode,
					email: selectedEmail,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to confirm selection");
			}

			const { redirectTo } = await response.json();

			// Clear URL parameters before redirecting
			window.history.replaceState({}, "", "/");

			// Redirect to tenant selector or gateway destination
			window.location.href = redirectTo;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to confirm selection. Please try again.");
			setLoading(false);
		}
	}

	async function handlePasswordLogin(e: React.FormEvent) {
		e.preventDefault();
		setError("");
		setEmailError("");
		setPasswordError("");

		// Validate email and password
		const isEmailValid = validateEmail(email);
		const isPasswordValid = validatePassword(password);

		if (!isEmailValid || !isPasswordValid) {
			return;
		}

		setLoading(true);

		try {
			// Use better-auth client for password login
			const result = await authClient.signIn.email({
				email,
				password,
				rememberMe,
			});

			if (result.error) {
				// Check for specific error codes/status from backend
				// HTTP 423 = account locked, HTTP 429 = rate limit exceeded
				const errorCode = result.error.code;
				const errorStatus = result.error.status;
				if (errorCode === "account_locked" || errorStatus === 423) {
					setError(content.accountLocked.value);
				} else if (errorStatus === 403 || result.error.message === "ACCOUNT_INACTIVE") {
					setError(content.accountInactive.value);
				} else if (errorCode === "rate_limit_exceeded" || errorStatus === 429) {
					setError(content.rateLimitExceeded.value);
				} else {
					setError(content.loginFailed.value);
				}
				setLoading(false);
				return;
			}

			// Login successful - redirect to tenant selector with redirect param
			window.location.href = tenantSelectorUrl;
		} catch (_err) {
			setError(content.loginError.value);
			setLoading(false);
		}
	}

	async function handleOAuthLogin(provider: "google" | "github") {
		// Save preference for UX (checkbox state persistence on page revisit)
		// saveRememberMePreference(rememberMe);

		// Use better-auth client signIn.social() method
		// The remember-me flag is not passed to OAuth login, but the corresponding
		// implementation code has not been removed.
		// IMPORTANT: callbackURL is set to "/login" instead of tenantSelectorUrl so that
		// LoginPage loads after OAuth and can check for email_selection cookie
		await authClient.signIn.social({
			provider,
			callbackURL: "/login",
			additionalData: { rememberMe: false },
		});
	}

	// Show loading spinner while checking session
	if (isSessionPending) {
		return (
			<div className={styles.container}>
				<div className={styles.loadingSpinner} data-testid="session-loading-spinner" />
			</div>
		);
	}

	// Show email selection UI if GitHub OAuth returned multiple verified emails
	if (showEmailSelection) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.brandingContainer}>
						<div className={styles.iconBox}>📄</div>
						<div className={styles.textContainer}>
							<div className={styles.brandName}>{content.brandName}</div>
							<div className={styles.tagline}>{content.tagline}</div>
						</div>
					</div>

					<h2 className={styles.emailSelectionTitle}>
						{content.selectEmailTitle?.value || "Select Your Email Address"}
					</h2>
					<p className={styles.emailSelectionSubtitle}>
						{content.selectEmailSubtitle?.value ||
							"GitHub returned multiple verified email addresses. Please select which one to use for your Jolli account:"}
					</p>

					<form onSubmit={handleEmailSelection} className={styles.form}>
						<div className={styles.emailOptionsContainer}>
							{pendingEmails.map(emailOption => (
								<label key={emailOption} className={styles.emailOption}>
									<input
										type="radio"
										name="email"
										value={emailOption}
										checked={selectedEmail === emailOption}
										onChange={() => setSelectedEmail(emailOption)}
										disabled={loading}
									/>
									<span className={styles.emailText}>{emailOption}</span>
									{emailOption === primaryEmail && (
										<span className={styles.primaryBadge}>
											{content.primaryBadge?.value || "Primary"}
										</span>
									)}
								</label>
							))}
						</div>

						{error && <div className={styles.errorMessage}>{error}</div>}

						<button type="submit" className={styles.button} disabled={loading || !selectedEmail}>
							{loading
								? content.submitting?.value || "Confirming..."
								: content.continue?.value || "Continue"}
						</button>
					</form>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.brandingContainer}>
					<div className={styles.iconBox}>📄</div>
					<div className={styles.textContainer}>
						<div className={styles.brandName}>{content.brandName}</div>
						<div className={styles.tagline}>{content.tagline}</div>
					</div>
				</div>

				{/* Password Login Form */}
				<form onSubmit={handlePasswordLogin} className={styles.form}>
					<div>
						<input
							type="email"
							value={email}
							onChange={e => setEmail(e.target.value)}
							placeholder={content.email.value}
							className={styles.input}
							required
							disabled={loading}
						/>
						{emailError && <div className={styles.errorMessage}>{emailError}</div>}
					</div>

					<div>
						<input
							type="password"
							value={password}
							onChange={e => setPassword(e.target.value)}
							placeholder={content.password.value}
							className={styles.input}
							required
							disabled={loading}
						/>
						{passwordError && <div className={styles.errorMessage}>{passwordError}</div>}
					</div>

					<div className={styles.rememberMeRow}>
						<label className={styles.checkboxLabel}>
							<input
								type="checkbox"
								checked={rememberMe}
								onChange={e => {
									const checked = e.target.checked;
									setRememberMe(checked);
									saveRememberMePreference(checked);
								}}
								data-testid="remember-me-checkbox"
								disabled={loading}
							/>
							<span>{content.rememberMe?.value || "Keep me signed in"}</span>
						</label>
						<a href="/forgot-password" className={styles.forgotPasswordLink}>
							{content.forgotPassword?.value || "Forgot password?"}
						</a>
					</div>

					{error && <div className={styles.errorMessage}>{error}</div>}

					<button type="submit" className={styles.loginButton} disabled={loading}>
						{loading ? content.loggingIn : content.login}
					</button>
				</form>

				{/* Divider */}
				<div className={styles.divider}>
					<span className={styles.dividerText}>{content.orLoginWith}</span>
				</div>

				{/* OAuth Buttons */}
				<div className={styles.oauthButtons}>
					<button
						type="button"
						onClick={() => handleOAuthLogin("google")}
						className={styles.oauthButton}
						disabled={loading}
					>
						<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
							<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
							<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
							<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
							<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
						</svg>
						{content.loginWithGoogle}
					</button>

					<button
						type="button"
						onClick={() => handleOAuthLogin("github")}
						className={styles.oauthButton}
						disabled={loading}
					>
						<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
						</svg>
						{content.loginWithGitHub}
					</button>
				</div>
			</div>
		</div>
	);
}
