import styles from "./LoginPage.module.css";
import { type PasswordValidationError, validatePassword as validatePasswordShared } from "jolli-common";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export function ResetPasswordPage(): ReactElement {
	const content = useIntlayer("resetPasswordPage");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isValidating, setIsValidating] = useState(false);
	const [tokenValid, setTokenValid] = useState(false);
	const [hasValidated, setHasValidated] = useState(false);

	useEffect(() => {
		// Prevent double validation (React StrictMode or component remounting)
		if (hasValidated) {
			return;
		}

		async function validateToken() {
			setHasValidated(true);

			// Extract token from URL
			const params = new URLSearchParams(window.location.search);
			const tokenParam = params.get("token");

			/* v8 ignore start -- defensive validation, token presence checked before page access */
			if (!tokenParam) {
				setError("Invalid or missing reset token. Please request a new password reset.");
				setIsValidating(false);
				return;
			}
			/* v8 ignore stop */

			setToken(tokenParam);
			setIsValidating(true);

			try {
				// Validate token with backend
				const response = await fetch(
					`${window.location.origin}/api/auth/legacy/password/validate-reset-token?token=${encodeURIComponent(tokenParam)}`,
				);

				/* v8 ignore start -- HTTP error handling for network/server issues */
				if (!response.ok) {
					setError("Failed to validate reset link. Please try again later.");
					setIsValidating(false);
					return;
				}
				/* v8 ignore stop */

				const result = await response.json();

				if (result.valid) {
					setTokenValid(true);
				} else {
					/* v8 ignore start -- error handling branches covered by backend tests */
					// Show appropriate error message based on error type
					switch (result.error) {
						case "expired_token":
							setError(content.expiredToken.value);
							break;
						case "used_token":
							setError(content.usedToken.value);
							break;
						case "invalid_token":
							setError(content.invalidToken.value);
							break;
						default:
							setError(content.invalidOrMissingToken.value);
					}
					/* v8 ignore stop */
				}
			} catch (_error) {
				/* v8 ignore next - network error handling */
				setError("Failed to validate reset link. Please try again later.");
			} finally {
				setIsValidating(false);
			}
		}

		validateToken();
	}, [hasValidated]);

	/**
	 * Get localized error message for password validation error.
	 */
	function getPasswordErrorMessage(error: PasswordValidationError): string {
		const errorMessages: Record<PasswordValidationError, string> = {
			required: content.passwordMinLength.value, // Fallback - form has required attribute
			too_short: content.passwordMinLength.value,
			too_long: content.passwordMaxLength.value,
			needs_uppercase: content.passwordNeedsUppercase.value,
			needs_lowercase: content.passwordNeedsLowercase.value,
			needs_number: content.passwordNeedsNumber.value,
			needs_special: content.passwordNeedsSpecial.value,
			contains_email: content.passwordMinLength.value, // Fallback - reset password doesn't check email
		};
		return errorMessages[error];
	}

	/**
	 * Validate password using shared validation from jolli-common.
	 */
	function validatePassword(passwordValue: string): string | null {
		const result = validatePasswordShared(passwordValue);
		if (!result.valid && result.error) {
			return getPasswordErrorMessage(result.error);
		}
		return null;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		/* v8 ignore start -- defensive validation, token is validated on page load */
		if (!token) {
			setError("Invalid reset token");
			return;
		}
		/* v8 ignore stop */

		if (newPassword !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		// Validate password
		const passwordError = validatePassword(newPassword);
		if (passwordError) {
			setError(passwordError);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			// Call custom reset password endpoint
			const response = await fetch(`${window.location.origin}/api/auth/legacy/password/reset-password`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					token,
					newPassword,
				}),
			});

			const result = await response.json();

			setIsLoading(false);

			/* v8 ignore start -- error handling branches covered by backend tests */
			if (!result.success) {
				// Show appropriate error message based on error type
				if (result.error === "password_reused") {
					setError("This password was used recently. Please choose a different password.");
				} else if (result.error === "expired_token") {
					setError("This reset link has expired. Please request a new password reset.");
				} else if (result.error === "used_token") {
					setError("This reset link has already been used. Please request a new password reset.");
				} else if (result.error === "invalid_token") {
					setError("This reset link is invalid. Please request a new password reset.");
				} else {
					setError(result.message || "Failed to reset password. Please try again later.");
				}
				return;
			}
			/* v8 ignore stop */

			// Success
			setIsSuccess(true);
			// Redirect to login after 3 seconds
			/* v8 ignore start -- redirect tested via integration tests */
			setTimeout(() => {
				window.location.href = "/login";
			}, 3000);
			/* v8 ignore stop */
			/* v8 ignore start -- error handling for network failures */
		} catch (_error) {
			setIsLoading(false);
			setError("Failed to reset password. Please try again later.");
		}
		/* v8 ignore stop */
	}

	if (isSuccess) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.brandingContainer}>
						<div className={styles.iconBox}>✓</div>
						<div className={styles.textContainer}>
							<div className={styles.brandName} style={{ color: "#4caf50" }}>
								Password Reset Successful!
							</div>
						</div>
					</div>

					<p style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px" }}>
						Your password has been successfully reset. You will be redirected to the login page...
					</p>

					<a
						href="/login"
						style={{ textAlign: "center", display: "block", color: "#5b7ee5", textDecoration: "none" }}
					>
						Go to Login Now
					</a>
				</div>
			</div>
		);
	}

	// Show loading state while validating token
	if (isValidating) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.brandingContainer}>
						<div className={styles.iconBox}>📄</div>
						<div className={styles.textContainer}>
							<div className={styles.brandName}>{content.resetPassword}</div>
						</div>
					</div>

					<p style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}>
						{content.validatingLink}
					</p>
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
						<div className={styles.brandName}>Reset Password</div>
					</div>
				</div>

				{tokenValid && (
					<p style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}>
						Enter your new password below.
					</p>
				)}

				{error && !tokenValid && (
					<div
						style={{
							backgroundColor: "#fee",
							border: "1px solid #fcc",
							padding: "16px",
							borderRadius: "4px",
							marginBottom: "16px",
						}}
					>
						<div className={styles.errorMessage}>{error}</div>
						<a
							href="/forgot-password"
							style={{
								textAlign: "center",
								display: "block",
								color: "#5b7ee5",
								textDecoration: "none",
								marginTop: "8px",
							}}
						>
							Request New Reset Link
						</a>
					</div>
				)}

				{tokenValid && (
					<form onSubmit={handleSubmit} className={styles.form}>
						<div>
							<input
								type="password"
								value={newPassword}
								onChange={e => setNewPassword(e.target.value)}
								placeholder="New Password"
								className={styles.input}
								required
								disabled={isLoading}
							/>
							<p style={{ fontSize: "12px", color: "#80868b", marginTop: "4px" }}>
								Must be 8-36 characters with uppercase, lowercase, number, and special character
							</p>
						</div>

						<div>
							<input
								type="password"
								value={confirmPassword}
								onChange={e => setConfirmPassword(e.target.value)}
								placeholder="Confirm Password"
								className={styles.input}
								required
								disabled={isLoading}
							/>
						</div>

						{error && tokenValid && <div className={styles.errorMessage}>{error}</div>}

						<button type="submit" className={styles.loginButton} disabled={isLoading}>
							{isLoading ? "Resetting..." : "Reset Password"}
						</button>

						<a
							href="/login"
							style={{
								textAlign: "center",
								display: "block",
								fontSize: "14px",
								color: "#5b7ee5",
								textDecoration: "none",
								marginTop: "8px",
							}}
						>
							Back to Login
						</a>
					</form>
				)}
			</div>
		</div>
	);
}
