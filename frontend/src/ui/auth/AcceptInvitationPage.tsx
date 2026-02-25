import { authClient } from "../../lib/authClient";
import { clearEmailSelectionCookie, getEmailSelectionCookieData } from "../../util/AuthCookieUtil";
import { parseNameFromEmail } from "../../util/NameUtil";
import styles from "./LoginPage.module.css";
import { type PasswordValidationError, validatePassword as validatePasswordShared } from "jolli-common";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Response from the invitation validation API.
 */
interface ValidateInvitationResponse {
	valid: boolean;
	error?:
		| "missing_token"
		| "invalid_token"
		| "expired_token"
		| "used_token"
		| "invitation_not_found"
		| "server_error";
	invitation?: {
		email: string;
		role: "owner" | "admin" | "member";
		name: string | null;
		organizationName: string;
		userExists: boolean;
		hasCredential: boolean;
	};
}

/**
 * Response from the invitation accept API.
 */
interface AcceptInvitationResponse {
	success: boolean;
	error?:
		| "missing_fields"
		| "invalid_token"
		| "expired_token"
		| "used_token"
		| "invitation_not_found"
		| "email_mismatch"
		| "invalid_password"
		| "user_exists"
		| "server_error";
	message?: string;
}

interface ValidatePendingEmailSelectionResponse {
	pendingEmailSelection?: {
		emails: Array<string>;
	};
}

interface SelectEmailResponse {
	effectiveEmail?: string;
}

/**
 * Accept Invitation page component.
 * Allows users to accept an invitation by setting up their password.
 */
export function AcceptInvitationPage(): ReactElement {
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [name, setName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [existingPassword, setExistingPassword] = useState("");
	const [isExistingAccepting, setIsExistingAccepting] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isValidating, setIsValidating] = useState(true);
	const [tokenValid, setTokenValid] = useState(false);
	const [hasValidated, setHasValidated] = useState(false);
	const [invitation, setInvitation] = useState<ValidateInvitationResponse["invitation"] | null>(null);
	const [isOAuthLoading, setIsOAuthLoading] = useState(false);
	const [acceptedViaOAuth, setAcceptedViaOAuth] = useState(false);

	const content = useIntlayer("acceptInvitation");

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

			if (!tokenParam) {
				setError(content.invalidToken.value);
				setIsValidating(false);
				return;
			}

			setToken(tokenParam);

			try {
				// Validate token with backend
				const response = await fetch(
					`${window.location.origin}/api/invitation/validate?token=${encodeURIComponent(tokenParam)}`,
				);

				if (!response.ok) {
					setError(content.serverError.value);
					setIsValidating(false);
					return;
				}

				const result = (await response.json()) as ValidateInvitationResponse;

				if (result.valid && result.invitation) {
					setTokenValid(true);
					setInvitation(result.invitation);
					// Pre-fill name if provided in invitation
					if (result.invitation.name) {
						setName(result.invitation.name);
					} else {
						setName(parseNameFromEmail(result.invitation.email));
					}
				} else {
					// Show appropriate error message based on error type
					switch (result.error) {
						case "expired_token":
							setError(content.expiredToken.value);
							break;
						case "used_token":
							setError(content.usedToken.value);
							break;
						case "invitation_not_found":
							setError(content.invitationNotFound.value);
							break;
						case "invalid_token":
						case "missing_token":
							setError(content.invalidToken.value);
							break;
						/* c8 ignore next 2 -- defensive code for unexpected error types */
						default:
							setError(content.serverError.value);
					}
				}
			} catch (_error) {
				setError(content.serverError.value);
			} finally {
				setIsValidating(false);
			}
		}

		validateToken();
	}, [hasValidated, content]);

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

	/**
	 * Validate password using shared validation from jolli-common.
	 */
	function validatePassword(passwordValue: string): string | null {
		const result = validatePasswordShared(passwordValue, invitation?.email);
		if (!result.valid && result.error) {
			return getPasswordErrorMessage(result.error);
		}
		return null;
	}

	function getInvitationFlags() {
		return {
			userExists: invitation?.userExists ?? false,
			hasCredential: invitation?.hasCredential ?? false,
		};
	}

	async function handleAcceptExistingPassword(e: React.FormEvent) {
		e.preventDefault();

		if (!token) {
			setError(content.invalidToken.value);
			return;
		}

		if (!existingPassword) {
			setError(content.passwordRequired.value);
			return;
		}

		setIsExistingAccepting(true);
		setError(null);

		try {
			const response = await fetch(`${window.location.origin}/api/invitation/accept-existing-password`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					token,
					password: existingPassword,
				}),
			});

			const result = (await response.json()) as AcceptInvitationResponse;

			setIsExistingAccepting(false);

			if (!result.success) {
				switch (result.error) {
					case "expired_token":
						setError(content.expiredToken.value);
						break;
					case "used_token":
						setError(content.usedToken.value);
						break;
					case "invitation_not_found":
						setError(content.invitationNotFound.value);
						break;
					case "invalid_password":
						setError(result.message || content.serverError.value);
						break;
					case "invalid_token":
					case "missing_fields":
						setError(content.invalidToken.value);
						break;
					default:
						setError(result.message || content.serverError.value);
				}
				return;
			}

			setIsSuccess(true);
			setTimeout(() => {
				window.location.href = "/login";
			}, 3000);
		} catch {
			setIsExistingAccepting(false);
			setError(content.serverError.value);
		}
	}

	/**
	 * Handles OAuth-based invitation acceptance.
	 * Redirects to OAuth provider with callback URL that includes the token.
	 */
	async function handleOAuthLogin(provider: "google" | "github") {
		/* c8 ignore next 4 -- defensive code, OAuth buttons only shown when token is valid */
		if (!token) {
			setError(content.invalidToken.value);
			return;
		}

		setIsOAuthLoading(true);
		setError(null);

		// Use better-auth client signIn.social() method
		// Callback URL must be absolute for OAuth to work properly
		const callbackURL = `${window.location.origin}/invite/accept?token=${encodeURIComponent(token)}&oauth=pending`;

		await authClient.signIn.social({
			provider,
			callbackURL,
		});
	}

	/**
	 * Abortable sleep that rejects when signal is aborted.
	 */
	function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}
			const timeoutId = setTimeout(resolve, ms);
			signal.addEventListener(
				"abort",
				() => {
					clearTimeout(timeoutId);
					reject(signal.reason);
				},
				{ once: true },
			);
		});
	}

	/**
	 * Completes OAuth-based invitation acceptance after returning from OAuth provider.
	 * Waits for session to be established before proceeding.
	 */
	async function completeOAuthAcceptance(invitationToken: string, signal: AbortSignal) {
		setIsOAuthLoading(true);

		try {
			const getSessionEmail = async (): Promise<string | null> => {
				for (let i = 0; i < 5; i++) {
					const sessionResponse = await fetch(`${window.location.origin}/auth/get-session`, {
						credentials: "include",
						signal,
					});

					if (sessionResponse.ok) {
						const sessionData = await sessionResponse.json();
						if (typeof sessionData?.user?.email === "string" && sessionData.user.email.length > 0) {
							return sessionData.user.email;
						}
					}

					await abortableSleep(500, signal);
				}

				return null;
			};

			const resolveInvitationEmailSelection = async (invitationEmail: string): Promise<boolean> => {
				const emailSelection = getEmailSelectionCookieData();
				if (!emailSelection?.code) {
					return false;
				}

				const validateResponse = await fetch(`${window.location.origin}/auth/validate-code`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					signal,
					body: JSON.stringify({ code: emailSelection.code }),
				});

				if (!validateResponse.ok) {
					clearEmailSelectionCookie();
					return false;
				}

				const validateData = (await validateResponse.json()) as ValidatePendingEmailSelectionResponse;
				const invitationEmailMatch = validateData.pendingEmailSelection?.emails.find(
					email => email.toLowerCase() === invitationEmail.toLowerCase(),
				);
				if (!invitationEmailMatch) {
					clearEmailSelectionCookie();
					return false;
				}

				const selectResponse = await fetch(`${window.location.origin}/auth/select-email`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					signal,
					body: JSON.stringify({ code: emailSelection.code, email: invitationEmailMatch }),
				});

				let selectData: SelectEmailResponse | undefined;
				if (selectResponse.ok) {
					try {
						selectData = (await selectResponse.json()) as SelectEmailResponse;
					} catch {
						selectData = undefined;
					}
				}

				clearEmailSelectionCookie();
				if (!selectResponse.ok) {
					return false;
				}

				return selectData?.effectiveEmail?.toLowerCase() === invitationEmail.toLowerCase();
			};

			const sessionEmail = await getSessionEmail();
			if (!sessionEmail) {
				setIsOAuthLoading(false);
				setError(content.oauthSessionFailed.value);
				return;
			}

			const invitationEmail = invitation?.email?.toLowerCase();
			if (invitationEmail && sessionEmail.toLowerCase() !== invitationEmail) {
				const selectionSucceeded = await resolveInvitationEmailSelection(invitationEmail);
				if (!selectionSucceeded) {
					setIsOAuthLoading(false);
					setError(content.emailMismatch.value);
					return;
				}
			}

			const response = await fetch(`${window.location.origin}/api/invitation/accept-social`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				signal,
				body: JSON.stringify({
					token: invitationToken,
				}),
			});

			const result = (await response.json()) as AcceptInvitationResponse;

			setIsOAuthLoading(false);

			if (!result.success) {
				switch (result.error) {
					case "expired_token":
						setError(content.expiredToken.value);
						break;
					case "used_token":
						setError(content.usedToken.value);
						break;
					case "invitation_not_found":
						setError(content.invitationNotFound.value);
						break;
					case "email_mismatch":
						setError(content.emailMismatch.value);
						break;
					case "user_exists":
						setError(content.userExists.value);
						break;
					case "invalid_token":
					case "missing_fields":
						setError(content.invalidToken.value);
						break;
					/* c8 ignore next 3 -- defensive code for unexpected error types */
					default:
						setError(result.message || content.serverError.value);
				}
				return;
			}

			// Success - OAuth users are already logged in, redirect to tenant selector
			setAcceptedViaOAuth(true);
			setIsSuccess(true);
			/* c8 ignore next 4 -- delayed redirect, impractical to test with 3s timeout */
			// Redirect to tenant selector after 3 seconds (user is already authenticated via OAuth)
			setTimeout(() => {
				window.location.href = "/select-tenant";
			}, 3000);
		} catch (error) {
			// Ignore abort errors (component unmounted)
			if (error instanceof DOMException && error.name === "AbortError") {
				return;
			}
			setIsOAuthLoading(false);
			setError(content.serverError.value);
		}
	}

	// Check for OAuth callback (returning from OAuth provider)
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const oauthPending = params.get("oauth");
		const tokenParam = params.get("token");

		if (oauthPending === "pending" && tokenParam && tokenValid) {
			// Remove oauth param from URL to prevent re-triggering
			try {
				const newUrl = new URL(window.location.href);
				newUrl.searchParams.delete("oauth");
				window.history.replaceState({}, "", newUrl.toString());
			} catch {
				// In test environments, window.location.href may not be a valid URL
			}

			// Complete the OAuth acceptance with AbortController for cleanup
			const abortController = new AbortController();
			completeOAuthAcceptance(tokenParam, abortController.signal);

			return () => {
				abortController.abort();
			};
		}
	}, [tokenValid]);

	function getRoleDisplayName(role: "owner" | "admin" | "member"): string {
		switch (role) {
			case "owner":
				return content.roleOwner.value;
			case "admin":
				return content.roleAdmin.value;
			case "member":
				return content.roleMember.value;
			/* c8 ignore next 2 -- defensive code, all role values are handled */
			default:
				return role;
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		/* c8 ignore next 4 -- defensive code, form is only shown when token is valid */
		if (!token) {
			setError(content.invalidToken.value);
			return;
		}

		if (password !== confirmPassword) {
			setError(content.passwordMismatch.value);
			return;
		}

		const passwordError = validatePassword(password);
		if (passwordError) {
			setError(passwordError);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch(`${window.location.origin}/api/invitation/accept-password`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					token,
					password,
					name: name.trim() || undefined,
				}),
			});

			const result = (await response.json()) as AcceptInvitationResponse;

			setIsLoading(false);

			if (!result.success) {
				switch (result.error) {
					case "expired_token":
						setError(content.expiredToken.value);
						break;
					case "used_token":
						setError(content.usedToken.value);
						break;
					case "invitation_not_found":
						setError(content.invitationNotFound.value);
						break;
					case "invalid_password":
						setError(result.message || content.serverError.value);
						break;
					case "user_exists":
						setError(content.userExists.value);
						break;
					case "invalid_token":
					case "missing_fields":
						setError(content.invalidToken.value);
						break;
					default:
						setError(result.message || content.serverError.value);
				}
				return;
			}

			// Success
			setIsSuccess(true);
			/* c8 ignore next 4 -- delayed redirect, impractical to test with 3s timeout */
			// Redirect to login after 3 seconds
			setTimeout(() => {
				window.location.href = "/login";
			}, 3000);
		} catch (_error) {
			setIsLoading(false);
			setError(content.serverError.value);
		}
	}

	if (isSuccess) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.brandingContainer}>
						<div className={styles.iconBox}>&#10003;</div>
						<div className={styles.textContainer}>
							<div
								className={styles.brandName}
								style={{ color: "#4caf50" }}
								data-testid="accept-invitation-success-title"
							>
								{content.accountCreated}
							</div>
						</div>
					</div>

					<p
						style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px" }}
						data-testid="accept-invitation-success-message"
					>
						{content.successMessage}
					</p>

					<a
						href={acceptedViaOAuth ? "/select-tenant" : "/login"}
						style={{ textAlign: "center", display: "block", color: "#5b7ee5", textDecoration: "none" }}
						data-testid="accept-invitation-go-to-login"
					>
						{content.goToLogin}
					</a>
				</div>
			</div>
		);
	}

	// Show OAuth completion loading state
	if (isOAuthLoading && !error) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.brandingContainer}>
						<div className={styles.iconBox}>&#128221;</div>
						<div className={styles.textContainer}>
							<div className={styles.brandName}>{content.pageTitle}</div>
						</div>
					</div>

					<p
						style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}
						data-testid="accept-invitation-completing-oauth"
					>
						{content.completingOAuth}
					</p>
				</div>
			</div>
		);
	}

	if (isValidating) {
		return (
			<div className={styles.container}>
				<div className={styles.card}>
					<div className={styles.brandingContainer}>
						<div className={styles.iconBox}>&#128221;</div>
						<div className={styles.textContainer}>
							<div className={styles.brandName}>{content.pageTitle}</div>
						</div>
					</div>

					<p
						style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}
						data-testid="accept-invitation-validating"
					>
						{content.validating}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.brandingContainer}>
					<div className={styles.iconBox}>&#128221;</div>
					<div className={styles.textContainer}>
						<div className={styles.brandName}>{content.pageTitle}</div>
					</div>
				</div>

				{tokenValid && invitation && (
					<p
						style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}
						data-testid="accept-invitation-details"
					>
						{content.invitedToJoin}{" "}
						<strong data-testid="accept-invitation-org-name">{invitation.organizationName}</strong>{" "}
						{content.asRole}{" "}
						<strong data-testid="accept-invitation-role">{getRoleDisplayName(invitation.role)}</strong>
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
						<div className={styles.errorMessage} data-testid="accept-invitation-error">
							{error}
						</div>
						<a
							href="/login"
							style={{
								textAlign: "center",
								display: "block",
								color: "#5b7ee5",
								textDecoration: "none",
								marginTop: "8px",
							}}
							data-testid="accept-invitation-back-to-login"
						>
							{content.backToLogin}
						</a>
					</div>
				)}

				{tokenValid && invitation && getInvitationFlags().userExists && getInvitationFlags().hasCredential && (
					<div>
						<p
							style={{ textAlign: "center", color: "#5f6368", marginBottom: "16px", fontSize: "14px" }}
							data-testid="accept-invitation-existing-user-message"
						>
							{content.existingUserPasswordMessage.value}
						</p>

						{error && (
							<div className={styles.errorMessage} data-testid="accept-invitation-form-error">
								{error}
							</div>
						)}

						<form onSubmit={handleAcceptExistingPassword} className={styles.form}>
							<div>
								<input
									type="email"
									value={invitation.email}
									placeholder={content.email.value}
									className={styles.input}
									disabled={true}
									style={{ backgroundColor: "#f5f5f5" }}
								/>
							</div>

							<div>
								<input
									type="password"
									value={existingPassword}
									onChange={e => setExistingPassword(e.target.value)}
									placeholder={content.password.value}
									className={styles.input}
									disabled={isExistingAccepting}
								/>
							</div>

							<button
								type="submit"
								className={styles.loginButton}
								disabled={isExistingAccepting}
								data-testid="accept-invitation-existing-submit"
							>
								{isExistingAccepting
									? content.acceptingWithPassword.value
									: content.acceptWithPassword.value}
							</button>
						</form>

						{/* OAuth Divider */}
						<div className={styles.divider}>
							<span className={styles.dividerText} data-testid="accept-invitation-existing-oauth-divider">
								{content.orSignInWith}
							</span>
						</div>

						{/* OAuth Buttons */}
						<div className={styles.oauthButtons}>
							<button
								type="button"
								onClick={() => handleOAuthLogin("google")}
								className={styles.oauthButton}
								disabled={isExistingAccepting || isOAuthLoading}
								data-testid="accept-invitation-existing-google-btn"
							>
								<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
									<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
									<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
									<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
									<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
								</svg>
								{content.signInWithGoogle}
							</button>

							<button
								type="button"
								onClick={() => handleOAuthLogin("github")}
								className={styles.oauthButton}
								disabled={isExistingAccepting || isOAuthLoading}
								data-testid="accept-invitation-existing-github-btn"
							>
								<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
								</svg>
								{content.signInWithGitHub}
							</button>
						</div>
					</div>
				)}

				{tokenValid && invitation && getInvitationFlags().userExists && !getInvitationFlags().hasCredential && (
					<form onSubmit={handleSubmit} className={styles.form}>
						<p
							style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}
							data-testid="accept-invitation-no-password-message"
						>
							{content.existingUserNoPasswordMessage.value}
						</p>

						<div>
							<input
								type="email"
								value={invitation.email}
								placeholder={content.email.value}
								className={styles.input}
								disabled={true}
								style={{ backgroundColor: "#f5f5f5" }}
							/>
						</div>

						<div>
							<input
								type="text"
								value={invitation.name || ""}
								placeholder={content.name.value}
								className={styles.input}
								disabled={true}
								style={{ backgroundColor: "#f5f5f5" }}
							/>
						</div>

						<div>
							<input
								type="password"
								value={password}
								onChange={e => setPassword(e.target.value)}
								placeholder={content.password.value}
								className={styles.input}
								required
								disabled={isLoading}
							/>
							<p style={{ fontSize: "12px", color: "#80868b", marginTop: "4px" }}>
								{content.passwordHint}
							</p>
						</div>

						<div>
							<input
								type="password"
								value={confirmPassword}
								onChange={e => setConfirmPassword(e.target.value)}
								placeholder={content.confirmPassword.value}
								className={styles.input}
								required
								disabled={isLoading}
							/>
						</div>

						{error && tokenValid && (
							<div className={styles.errorMessage} data-testid="accept-invitation-form-error">
								{error}
							</div>
						)}

						<button
							type="submit"
							className={styles.loginButton}
							disabled={isLoading}
							data-testid="accept-invitation-set-password-submit"
						>
							{isLoading ? content.settingPasswordToAccept.value : content.setPasswordToAccept.value}
						</button>

						{/* OAuth Divider */}
						<div className={styles.divider}>
							<span
								className={styles.dividerText}
								data-testid="accept-invitation-no-password-oauth-divider"
							>
								{content.orSignInWith}
							</span>
						</div>

						{/* OAuth Buttons */}
						<div className={styles.oauthButtons}>
							<button
								type="button"
								onClick={() => handleOAuthLogin("google")}
								className={styles.oauthButton}
								disabled={isLoading || isOAuthLoading}
								data-testid="accept-invitation-no-password-google-btn"
							>
								<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
									<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
									<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
									<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
									<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
								</svg>
								{content.signInWithGoogle}
							</button>

							<button
								type="button"
								onClick={() => handleOAuthLogin("github")}
								className={styles.oauthButton}
								disabled={isLoading || isOAuthLoading}
								data-testid="accept-invitation-no-password-github-btn"
							>
								<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
								</svg>
								{content.signInWithGitHub}
							</button>
						</div>
					</form>
				)}

				{tokenValid && invitation && !getInvitationFlags().userExists && (
					<form onSubmit={handleSubmit} className={styles.form}>
						<div>
							<input
								type="email"
								value={invitation.email}
								placeholder={content.email.value}
								className={styles.input}
								disabled={true}
								style={{ backgroundColor: "#f5f5f5" }}
							/>
						</div>

						<div>
							<input
								type="text"
								value={name}
								onChange={e => setName(e.target.value)}
								placeholder={content.namePlaceholder.value}
								className={styles.input}
								disabled={isLoading}
							/>
						</div>

						<div>
							<input
								type="password"
								value={password}
								onChange={e => setPassword(e.target.value)}
								placeholder={content.password.value}
								className={styles.input}
								required
								disabled={isLoading}
							/>
							<p style={{ fontSize: "12px", color: "#80868b", marginTop: "4px" }}>
								{content.passwordHint}
							</p>
						</div>

						<div>
							<input
								type="password"
								value={confirmPassword}
								onChange={e => setConfirmPassword(e.target.value)}
								placeholder={content.confirmPassword.value}
								className={styles.input}
								required
								disabled={isLoading}
							/>
						</div>

						{error && tokenValid && (
							<div className={styles.errorMessage} data-testid="accept-invitation-form-error">
								{error}
							</div>
						)}

						<button
							type="submit"
							className={styles.loginButton}
							disabled={isLoading}
							data-testid="accept-invitation-create-submit"
						>
							{isLoading ? content.creatingAccount : content.createAccount}
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
							data-testid="accept-invitation-form-back-to-login"
						>
							{content.backToLogin}
						</a>

						{/* OAuth Divider */}
						<div className={styles.divider}>
							<span className={styles.dividerText} data-testid="accept-invitation-oauth-divider">
								{content.orSignUpWith}
							</span>
						</div>

						{/* OAuth Buttons */}
						<div className={styles.oauthButtons}>
							<button
								type="button"
								onClick={() => handleOAuthLogin("google")}
								className={styles.oauthButton}
								disabled={isLoading || isOAuthLoading}
								data-testid="accept-invitation-google-btn"
							>
								<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
									<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
									<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
									<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
									<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
								</svg>
								{content.signUpWithGoogle}
							</button>

							<button
								type="button"
								onClick={() => handleOAuthLogin("github")}
								className={styles.oauthButton}
								disabled={isLoading || isOAuthLoading}
								data-testid="accept-invitation-github-btn"
							>
								<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
									<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
								</svg>
								{content.signUpWithGitHub}
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}
