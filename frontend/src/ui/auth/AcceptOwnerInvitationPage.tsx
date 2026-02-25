import { authClient } from "../../lib/authClient";
import { clearEmailSelectionCookie, getEmailSelectionCookieData } from "../../util/AuthCookieUtil";
import { parseNameFromEmail } from "../../util/NameUtil";
import styles from "./LoginPage.module.css";
import { type PasswordValidationError, validatePassword as validatePasswordShared } from "jolli-common";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Response from the owner invitation validation API.
 */
interface ValidateOwnerInvitationResponse {
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
		name: string | null;
		tenantName: string;
		organizationName: string;
		userExists: boolean;
	};
}

/**
 * Response from the owner invitation accept API.
 */
interface AcceptOwnerInvitationResponse {
	success: boolean;
	error?:
		| "missing_fields"
		| "invalid_token"
		| "expired_token"
		| "used_token"
		| "invitation_not_found"
		| "email_mismatch"
		| "invalid_password"
		| "server_error";
	message?: string;
	tenantSlug?: string;
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
 * Error messages for i18n.
 */
interface ErrorMessages {
	expiredToken: string;
	usedToken: string;
	invitationNotFound: string;
	emailMismatch: string;
	invalidToken: string;
	serverError: string;
}

/**
 * Gets the error message for an API error.
 */
function getErrorMessage(error: string | undefined, message: string | undefined, messages: ErrorMessages): string {
	switch (error) {
		case "expired_token":
			return messages.expiredToken;
		case "used_token":
			return messages.usedToken;
		case "invitation_not_found":
			return messages.invitationNotFound;
		case "email_mismatch":
			return messages.emailMismatch;
		case "invalid_password":
			return message || messages.serverError;
		case "invalid_token":
		case "missing_token":
		case "missing_fields":
			return messages.invalidToken;
		default:
			return message || messages.serverError;
	}
}

/**
 * Password validation messages for i18n.
 */
interface PasswordValidationMessages {
	required: string;
	tooShort: string;
	tooLong: string;
	needsUppercase: string;
	needsLowercase: string;
	needsNumber: string;
	needsSpecialChar: string;
	containsEmail: string;
}

/**
 * Validates password against security requirements using shared validation from jolli-common.
 */
function validatePassword(
	passwordValue: string,
	email: string | undefined,
	messages: PasswordValidationMessages,
): string | null {
	const result = validatePasswordShared(passwordValue, email);
	if (!result.valid && result.error) {
		const errorMessages: Record<PasswordValidationError, string> = {
			required: messages.required,
			too_short: messages.tooShort,
			too_long: messages.tooLong,
			needs_uppercase: messages.needsUppercase,
			needs_lowercase: messages.needsLowercase,
			needs_number: messages.needsNumber,
			needs_special: messages.needsSpecialChar,
			contains_email: messages.containsEmail,
		};
		return errorMessages[result.error];
	}
	return null;
}

/**
 * Renders a status card (used for declined, success, loading states).
 */
function StatusCard({
	icon,
	title,
	titleColor,
	message,
	linkHref,
	linkText,
}: {
	icon: string;
	title: string;
	titleColor: string;
	message: string;
	linkHref?: string;
	linkText?: string;
}) {
	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.brandingContainer}>
					<div className={styles.iconBox}>{icon}</div>
					<div className={styles.textContainer}>
						<div className={styles.brandName} style={{ color: titleColor }}>
							{title}
						</div>
					</div>
				</div>
				<p style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px" }}>{message}</p>
				{linkHref && linkText && (
					<a
						href={linkHref}
						style={{ textAlign: "center", display: "block", color: "#5b7ee5", textDecoration: "none" }}
					>
						{linkText}
					</a>
				)}
			</div>
		</div>
	);
}

/**
 * Props for OAuth buttons component.
 */
interface OAuthButtonsProps {
	onGoogleClick: () => void;
	onGitHubClick: () => void;
	googleLabel: string;
	gitHubLabel: string;
	disabled: boolean;
}

/**
 * Polls for OAuth session establishment with retries.
 * Returns session email when established, otherwise null.
 */
async function pollForOAuthSession(maxAttempts: number, delayMs: number): Promise<string | null> {
	for (let i = 0; i < maxAttempts; i++) {
		const sessionResponse = await fetch(`${window.location.origin}/auth/get-session`, {
			credentials: "include",
		});

		if (sessionResponse.ok) {
			const sessionData = await sessionResponse.json();
			if (typeof sessionData?.user?.email === "string" && sessionData.user.email.length > 0) {
				return sessionData.user.email;
			}
		}

		await new Promise(resolve => setTimeout(resolve, delayMs));
	}
	return null;
}

/**
 * Reusable OAuth buttons component for Google and GitHub sign-in.
 */
function OAuthButtons({ onGoogleClick, onGitHubClick, googleLabel, gitHubLabel, disabled }: OAuthButtonsProps) {
	return (
		<div className={styles.oauthButtons}>
			<button type="button" onClick={onGoogleClick} className={styles.oauthButton} disabled={disabled}>
				<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
					<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
					<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
					<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
					<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
				</svg>
				{googleLabel}
			</button>

			<button type="button" onClick={onGitHubClick} className={styles.oauthButton} disabled={disabled}>
				<svg className={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
				</svg>
				{gitHubLabel}
			</button>
		</div>
	);
}

/**
 * Renders the decline button.
 */
function DeclineButton({
	onClick,
	disabled,
	isDeclining,
	labels,
}: {
	onClick: () => void;
	disabled: boolean;
	isDeclining: boolean;
	labels: { declining: string; decline: string };
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			style={{
				background: "none",
				border: "none",
				color: "#dc3545",
				cursor: disabled ? "not-allowed" : "pointer",
				fontSize: "14px",
				textDecoration: "underline",
			}}
		>
			{isDeclining ? labels.declining : labels.decline}
		</button>
	);
}

/**
 * Accept Owner Invitation page component.
 * Allows users to accept an owner invitation by setting up their password or using OAuth.
 */
export function AcceptOwnerInvitationPage(): ReactElement {
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [name, setName] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isDeclining, setIsDeclining] = useState(false);
	const [isSuccess, setIsSuccess] = useState(false);
	const [isDeclined, setIsDeclined] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [token, setToken] = useState<string | null>(null);
	const [isValidating, setIsValidating] = useState(true);
	const [tokenValid, setTokenValid] = useState(false);
	const [hasValidated, setHasValidated] = useState(false);
	const [invitation, setInvitation] = useState<ValidateOwnerInvitationResponse["invitation"] | null>(null);
	const [isOAuthLoading, setIsOAuthLoading] = useState(false);
	const [acceptedViaOAuth, setAcceptedViaOAuth] = useState(false);
	const [redirectUrl, setRedirectUrl] = useState<string>("/login");
	const [existingUserPassword, setExistingUserPassword] = useState("");
	const [isExistingPasswordLoading, setIsExistingPasswordLoading] = useState(false);

	const content = useIntlayer("acceptOwnerInvitation");

	useEffect(() => {
		if (hasValidated) {
			return;
		}

		async function validateToken() {
			setHasValidated(true);

			const params = new URLSearchParams(window.location.search);
			const tokenParam = params.get("token");

			if (!tokenParam) {
				setError(content.invalidToken.value);
				setIsValidating(false);
				return;
			}

			setToken(tokenParam);

			try {
				const response = await fetch(
					`${window.location.origin}/api/owner-invitation/validate?token=${encodeURIComponent(tokenParam)}`,
				);

				if (!response.ok) {
					setError(content.serverError.value);
					setIsValidating(false);
					return;
				}

				const result = (await response.json()) as ValidateOwnerInvitationResponse;

				if (result.valid && result.invitation) {
					setTokenValid(true);
					setInvitation(result.invitation);
					setName(result.invitation.name || parseNameFromEmail(result.invitation.email));
				} else {
					setError(getErrorMessage(result.error, undefined, errorMessages));
				}
			} catch {
				setError(content.serverError.value);
			} finally {
				setIsValidating(false);
			}
		}

		validateToken();
	}, [hasValidated, content]);

	// Build password validation messages from i18n content
	const passwordMessages: PasswordValidationMessages = {
		required: content.passwordRequired.value,
		tooShort: content.passwordTooShort.value,
		tooLong: content.passwordTooLong.value,
		needsUppercase: content.passwordNeedsUppercase.value,
		needsLowercase: content.passwordNeedsLowercase.value,
		needsNumber: content.passwordNeedsNumber.value,
		needsSpecialChar: content.passwordNeedsSpecialChar.value,
		containsEmail: content.passwordContainsEmail.value,
	};

	// Build error messages from i18n content
	const errorMessages: ErrorMessages = {
		expiredToken: content.expiredToken.value,
		usedToken: content.usedToken.value,
		invitationNotFound: content.invitationNotFound.value,
		emailMismatch: content.emailMismatch.value,
		invalidToken: content.invalidToken.value,
		serverError: content.serverError.value,
	};

	async function handleExistingPasswordLogin(e: React.FormEvent) {
		e.preventDefault();

		if (!token || !existingUserPassword) {
			setError(content.passwordRequired.value);
			return;
		}

		setIsExistingPasswordLoading(true);
		setError(null);

		try {
			const response = await fetch(`${window.location.origin}/api/owner-invitation/accept-existing-password`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					token,
					password: existingUserPassword,
				}),
			});

			const result = (await response.json()) as AcceptOwnerInvitationResponse;

			setIsExistingPasswordLoading(false);

			if (!result.success) {
				handleAcceptError(result);
				return;
			}

			setIsSuccess(true);
			setTimeout(() => {
				window.location.href = "/login";
			}, 3000);
		} catch {
			setIsExistingPasswordLoading(false);
			setError(content.serverError.value);
		}
	}

	async function handleOAuthLogin(provider: "google" | "github") {
		if (!token) {
			setError(content.invalidToken.value);
			return;
		}

		setIsOAuthLoading(true);
		setError(null);

		const callbackURL = `${window.location.origin}/owner-invite/accept?token=${encodeURIComponent(token)}&oauth=pending`;

		await authClient.signIn.social({
			provider,
			callbackURL,
		});
	}

	async function completeOAuthAcceptance(invitationToken: string) {
		setIsOAuthLoading(true);

		try {
			const sessionEmail = await pollForOAuthSession(5, 500);

			if (!sessionEmail) {
				setIsOAuthLoading(false);
				setError(content.oauthSessionFailed.value);
				return;
			}

			const invitationEmail = invitation?.email?.toLowerCase();
			if (invitationEmail && sessionEmail.toLowerCase() !== invitationEmail) {
				const emailSelection = getEmailSelectionCookieData();
				if (!emailSelection?.code) {
					setIsOAuthLoading(false);
					setError(content.emailMismatch.value);
					return;
				}

				const validateResponse = await fetch(`${window.location.origin}/auth/validate-code`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({ code: emailSelection.code }),
				});

				if (!validateResponse.ok) {
					clearEmailSelectionCookie();
					setIsOAuthLoading(false);
					setError(content.emailMismatch.value);
					return;
				}

				const validateData = (await validateResponse.json()) as ValidatePendingEmailSelectionResponse;
				const invitationEmailMatch = validateData.pendingEmailSelection?.emails.find(
					email => email.toLowerCase() === invitationEmail,
				);
				if (!invitationEmailMatch) {
					clearEmailSelectionCookie();
					setIsOAuthLoading(false);
					setError(content.emailMismatch.value);
					return;
				}

				const selectResponse = await fetch(`${window.location.origin}/auth/select-email`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
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
					setIsOAuthLoading(false);
					setError(content.emailMismatch.value);
					return;
				}

				if (selectData?.effectiveEmail?.toLowerCase() !== invitationEmail) {
					setIsOAuthLoading(false);
					setError(content.emailMismatch.value);
					return;
				}
			}

			const response = await fetch(`${window.location.origin}/api/owner-invitation/accept-social`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				credentials: "include",
				body: JSON.stringify({
					token: invitationToken,
				}),
			});

			const result = (await response.json()) as AcceptOwnerInvitationResponse;

			setIsOAuthLoading(false);

			if (!result.success) {
				handleAcceptError(result);
				return;
			}

			setAcceptedViaOAuth(true);
			setIsSuccess(true);
			if (result.tenantSlug) {
				setRedirectUrl(`/`);
			}
			setTimeout(() => {
				window.location.href = result.tenantSlug ? "/" : "/select-tenant";
			}, 3000);
		} catch {
			setIsOAuthLoading(false);
			setError(content.serverError.value);
		}
	}

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const oauthPending = params.get("oauth");
		const tokenParam = params.get("token");

		if (oauthPending === "pending" && tokenParam && tokenValid) {
			try {
				const newUrl = new URL(window.location.href);
				newUrl.searchParams.delete("oauth");
				window.history.replaceState({}, "", newUrl.toString());
			} catch {
				// In test environments, window.location.href may not be a valid URL
			}

			completeOAuthAcceptance(tokenParam);
		}
	}, [tokenValid]);

	function handleAcceptError(result: AcceptOwnerInvitationResponse) {
		setError(getErrorMessage(result.error, result.message, errorMessages));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!token) {
			setError(content.invalidToken.value);
			return;
		}

		if (password !== confirmPassword) {
			setError(content.passwordMismatch.value);
			return;
		}

		const passwordError = validatePassword(password, invitation?.email, passwordMessages);
		if (passwordError) {
			setError(passwordError);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const response = await fetch(`${window.location.origin}/api/owner-invitation/accept-password`, {
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

			const result = (await response.json()) as AcceptOwnerInvitationResponse;

			setIsLoading(false);

			if (!result.success) {
				handleAcceptError(result);
				return;
			}

			setIsSuccess(true);
			setTimeout(() => {
				window.location.href = "/login";
			}, 3000);
		} catch {
			setIsLoading(false);
			setError(content.serverError.value);
		}
	}

	async function handleDecline() {
		if (!token) {
			return;
		}

		if (!confirm("Are you sure you want to decline this invitation?")) {
			return;
		}

		setIsDeclining(true);
		setError(null);

		try {
			const response = await fetch(`${window.location.origin}/api/owner-invitation/decline`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ token }),
			});

			const result = (await response.json()) as AcceptOwnerInvitationResponse;

			setIsDeclining(false);

			if (!result.success) {
				handleAcceptError(result);
				return;
			}

			setIsDeclined(true);
		} catch {
			setIsDeclining(false);
			setError(content.serverError.value);
		}
	}

	// Declined state
	if (isDeclined) {
		return (
			<StatusCard
				icon="&#10005;"
				title={content.invitationDeclined.value}
				titleColor="#666"
				message={content.declineMessage.value}
				linkHref="/"
				linkText={content.backToHome.value}
			/>
		);
	}

	// Success state
	if (isSuccess) {
		return (
			<StatusCard
				icon="&#10003;"
				title={content.invitationAccepted.value}
				titleColor="#4caf50"
				message={acceptedViaOAuth ? content.successMessageOAuth.value : content.successMessage.value}
				linkHref={redirectUrl}
				linkText={acceptedViaOAuth ? content.goToDashboard.value : content.goToLogin.value}
			/>
		);
	}

	// OAuth completion loading state
	if (isOAuthLoading && !error) {
		return (
			<StatusCard
				icon="&#128273;"
				title={content.pageTitle.value}
				titleColor="#333"
				message={content.completingOAuth.value}
			/>
		);
	}

	// Validating state
	if (isValidating) {
		return (
			<StatusCard
				icon="&#128273;"
				title={content.pageTitle.value}
				titleColor="#333"
				message={content.validating.value}
			/>
		);
	}

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.brandingContainer}>
					<div className={styles.iconBox}>&#128273;</div>
					<div className={styles.textContainer}>
						<div className={styles.brandName}>{content.pageTitle}</div>
					</div>
				</div>

				{tokenValid && invitation && (
					<p style={{ textAlign: "center", color: "#5f6368", marginBottom: "24px", fontSize: "14px" }}>
						{content.invitedToOwn} <strong>{invitation.organizationName}</strong> {content.inTenant}{" "}
						<strong>{invitation.tenantName}</strong>
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
							href="/"
							style={{
								textAlign: "center",
								display: "block",
								color: "#5b7ee5",
								textDecoration: "none",
								marginTop: "8px",
							}}
						>
							{content.backToHome}
						</a>
					</div>
				)}

				{tokenValid &&
					invitation &&
					(invitation.userExists ? (
						// Existing user - show password login and OAuth options
						<div>
							<p
								style={{
									textAlign: "center",
									color: "#5f6368",
									marginBottom: "16px",
									fontSize: "14px",
								}}
							>
								{content.existingUserMessage}
							</p>

							{error && <div className={styles.errorMessage}>{error}</div>}

							{/* Password login form for existing users */}
							<form onSubmit={handleExistingPasswordLogin} className={styles.form}>
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
										value={existingUserPassword}
										onChange={e => setExistingUserPassword(e.target.value)}
										placeholder={content.password.value}
										className={styles.input}
										disabled={isExistingPasswordLoading || isOAuthLoading}
									/>
								</div>

								<button
									type="submit"
									className={styles.loginButton}
									disabled={isExistingPasswordLoading || isOAuthLoading || !existingUserPassword}
								>
									{isExistingPasswordLoading ? content.accepting : content.acceptWithPassword}
								</button>
							</form>

							{/* OAuth Divider */}
							<div className={styles.divider}>
								<span className={styles.dividerText}>{content.orAcceptWith}</span>
							</div>

							{/* OAuth Buttons */}
							<OAuthButtons
								onGoogleClick={() => handleOAuthLogin("google")}
								onGitHubClick={() => handleOAuthLogin("github")}
								googleLabel={content.acceptWithGoogle.value}
								gitHubLabel={content.acceptWithGitHub.value}
								disabled={isOAuthLoading || isExistingPasswordLoading}
							/>

							<div style={{ marginTop: "16px", textAlign: "center" }}>
								<DeclineButton
									onClick={handleDecline}
									disabled={isDeclining || isExistingPasswordLoading || isOAuthLoading}
									isDeclining={isDeclining}
									labels={{
										declining: content.declining.value,
										decline: content.declineInvitation.value,
									}}
								/>
							</div>
						</div>
					) : (
						// New user - show registration form
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

							{error && tokenValid && <div className={styles.errorMessage}>{error}</div>}

							<button type="submit" className={styles.loginButton} disabled={isLoading}>
								{isLoading ? content.accepting : content.acceptInvitation}
							</button>

							<div style={{ marginTop: "8px", textAlign: "center" }}>
								<DeclineButton
									onClick={handleDecline}
									disabled={isDeclining || isLoading}
									isDeclining={isDeclining}
									labels={{
										declining: content.declining.value,
										decline: content.declineInvitation.value,
									}}
								/>
							</div>

							{/* OAuth Divider */}
							<div className={styles.divider}>
								<span className={styles.dividerText}>{content.orAcceptWith}</span>
							</div>

							{/* OAuth Buttons */}
							<OAuthButtons
								onGoogleClick={() => handleOAuthLogin("google")}
								onGitHubClick={() => handleOAuthLogin("github")}
								googleLabel={content.acceptWithGoogle.value}
								gitHubLabel={content.acceptWithGitHub.value}
								disabled={isLoading || isOAuthLoading}
							/>
						</form>
					))}
			</div>
		</div>
	);
}
